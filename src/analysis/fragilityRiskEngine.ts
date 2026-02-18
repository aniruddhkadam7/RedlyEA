/**
 * Fragility Risk Engine
 *
 * Layers additional fragility / SPOF signals on top of the dependency graph
 * snapshot produced by impactDependencyEngine.
 *
 * Outputs:
 * - SPOF candidates (high inbound only, no alternative paths)
 * - Fragile systems (many downstream dependents + high technical debt)
 * - Vendor lock-in concentration per vendor
 * - Cycle participants (circular dependency risk)
 * - Composite fragility score per system
 */

import type { EaRepository } from '@/pages/dependency-view/utils/eaRepository';
import type { ImpactAnalysisSnapshot } from './impactDependencyEngine';

/* ---------- Exported types ---------- */

export type SpofCandidate = {
  id: string;
  name: string;
  type: string;
  inboundCount: number;
  outboundCount: number;
  /** True when this node has ≥3 inbound edges and 0 alternative paths exist */
  isHardSpof: boolean;
  /** Business criticality of the dependant processes/apps */
  dependantCriticality: 'high' | 'medium' | 'low';
  fragilityScore: number; // 0–100
};

export type FragileSystem = {
  id: string;
  name: string;
  type: string;
  technicalDebt: 'High' | 'Medium' | 'Low' | 'Unknown';
  downstreamCount: number;
  upstreamCount: number;
  vendorLockIn: 'High' | 'Medium' | 'Low' | 'Unknown';
  fragilityScore: number; // 0–100
  reasons: string[];
};

export type VendorLockInEntry = {
  vendor: string;
  systemCount: number;
  totalAnnualCost: number;
  processCount: number;
  lockInScore: number; // 0–100
};

export type FragilityRiskSnapshot = {
  /** Total aggregate fragility score for headline KPI */
  aggregateFragilityScore: number; // 0–100
  /** SPOF candidates sorted by score descending */
  spofCandidates: SpofCandidate[];
  /** Fragile / high-debt systems */
  fragileSystems: FragileSystem[];
  /** Vendor lock-in data */
  vendorLockIn: VendorLockInEntry[];
  /** Number of objects participating in detected cycles */
  cycleParticipantCount: number;
  /** Total broken/missing relationship count (targets pointing to non-existent objects) */
  brokenRelationshipCount: number;
};

/* ---------- Helpers ---------- */

const norm = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

const debtScore = (debt: string): number =>
  debt.toLowerCase() === 'high' ? 40 : debt.toLowerCase() === 'medium' ? 20 : 5;

const lockInScore = (risk: string): number =>
  risk.toLowerCase() === 'high' ? 30 : risk.toLowerCase() === 'medium' ? 15 : 3;

/* ---------- Main engine ---------- */

export function computeFragilityRiskSnapshot(
  snapshot: ImpactAnalysisSnapshot | null,
  repo: EaRepository,
): FragilityRiskSnapshot {
  const allObjects = Array.from(repo.objects.values()).filter(
    (o) => (o.attributes as any)?._deleted !== true,
  );
  const allRels = repo.relationships;

  /* ---- Build adjacency ---- */
  const inboundMap = new Map<string, string[]>(); // id → [fromId] (things that point TO this)
  const outboundMap = new Map<string, string[]>(); // id → [toId]

  for (const rel of allRels) {
    const out = outboundMap.get(rel.fromId) ?? [];
    out.push(rel.toId);
    outboundMap.set(rel.fromId, out);

    const inc = inboundMap.get(rel.toId) ?? [];
    inc.push(rel.fromId);
    inboundMap.set(rel.toId, inc);
  }

  /* ---- Broken relationships ---- */
  let brokenRelationshipCount = 0;
  for (const rel of allRels) {
    if (!repo.objects.has(rel.fromId) || !repo.objects.has(rel.toId)) {
      brokenRelationshipCount++;
    }
  }

  /* ---- SPOF candidates ---- */
  const spofCandidates: SpofCandidate[] = allObjects
    .map((o) => {
      const inbound = inboundMap.get(o.id) ?? [];
      const outbound = outboundMap.get(o.id) ?? [];
      if (inbound.length < 2) return null;

      // Hard SPOF = no outbound paths means this object has no fallback
      const isHardSpof = inbound.length >= 3 && outbound.length === 0;

      // Dependant criticality: compute max criticality of all objects that point to this one
      let maxCrit = 'low';
      for (const fromId of inbound) {
        const fromObj = repo.objects.get(fromId);
        if (!fromObj) continue;
        const crit = norm((fromObj.attributes as any).businessCriticality).toLowerCase();
        const procCrit = norm((fromObj.attributes as any).criticality).toLowerCase();
        if (crit === 'mission-critical' || crit === 'critical' || procCrit === 'high') {
          maxCrit = 'high';
          break;
        } else if (crit === 'high' || procCrit === 'medium') {
          maxCrit = 'medium';
        }
      }

      const critWeight = maxCrit === 'high' ? 20 : maxCrit === 'medium' ? 10 : 5;
      const fragilityScore = Math.min(
        100,
        inbound.length * 8 + (isHardSpof ? 30 : 0) + critWeight,
      );

      return {
        id: o.id,
        name: norm((o.attributes as any).name) || o.id,
        type: o.type,
        inboundCount: inbound.length,
        outboundCount: outbound.length,
        isHardSpof,
        dependantCriticality: maxCrit as 'high' | 'medium' | 'low',
        fragilityScore,
      } satisfies SpofCandidate;
    })
    .filter(Boolean)
    .sort((a, b) => b!.fragilityScore - a!.fragilityScore)
    .slice(0, 20) as SpofCandidate[];

  /* ---- Fragile systems ---- */
  const fragileSystems: FragileSystem[] = allObjects
    .map((o) => {
      const attrs = o.attributes as any;
      const debt = (norm(attrs.technicalDebtLevel) || 'Unknown') as FragileSystem['technicalDebt'];
      const vendorLockIn = (norm(attrs.vendorLockInRisk) || 'Unknown') as FragileSystem['vendorLockIn'];
      const downstreamCount = (outboundMap.get(o.id) ?? []).length;
      const upstreamCount = (inboundMap.get(o.id) ?? []).length;

      const debtSc = debtScore(debt);
      const lockSc = lockInScore(vendorLockIn);
      const depSc = Math.min(30, downstreamCount * 3);
      const fragilityScore = Math.min(100, debtSc + lockSc + depSc);

      if (fragilityScore < 15) return null;

      const reasons: string[] = [];
      if (debt === 'High') reasons.push('High technical debt');
      if (vendorLockIn === 'High') reasons.push('High vendor lock-in');
      if (downstreamCount >= 5) reasons.push(`${downstreamCount} downstream dependents`);
      if (upstreamCount >= 5) reasons.push(`Depended on by ${upstreamCount} systems`);

      return {
        id: o.id,
        name: norm(attrs.name) || o.id,
        type: o.type,
        technicalDebt: debt,
        downstreamCount,
        upstreamCount,
        vendorLockIn,
        fragilityScore,
        reasons,
      } satisfies FragileSystem;
    })
    .filter(Boolean)
    .sort((a, b) => b!.fragilityScore - a!.fragilityScore)
    .slice(0, 20) as FragileSystem[];

  /* ---- Vendor lock-in ---- */
  const vendorMap = new Map<
    string,
    { systemIds: Set<string>; totalCost: number; processCount: number }
  >();
  allObjects.forEach((o) => {
    const vendor = norm((o.attributes as any).vendorName);
    if (!vendor || vendor.toLowerCase() === 'internal') return;
    const entry = vendorMap.get(vendor) ?? { systemIds: new Set(), totalCost: 0, processCount: 0 };
    entry.systemIds.add(o.id);
    const cost = Number((o.attributes as any).annualRunCost ?? 0);
    if (!isNaN(cost)) entry.totalCost += cost;
    vendorMap.set(vendor, entry);
  });

  // Add process count (processes whose apps are linked to vendor)
  for (const rel of allRels) {
    if (!['SERVED_BY', 'SUPPORTED_BY'].includes(rel.type)) continue;
    const srcObj = repo.objects.get(rel.fromId);
    const tgtObj = repo.objects.get(rel.toId);
    if (!srcObj || !tgtObj) continue;
    const isProcess = ['BusinessProcess', 'businessProcess', 'Process'].includes(srcObj.type);
    const isApp = ['Application', 'application'].includes(tgtObj.type);
    if (isProcess && isApp) {
      const vendor = norm((tgtObj.attributes as any).vendorName);
      if (!vendor || vendor.toLowerCase() === 'internal') continue;
      const entry = vendorMap.get(vendor);
      if (entry) entry.processCount++;
    }
  }

  const vendorLockIn: VendorLockInEntry[] = Array.from(vendorMap.entries())
    .map(([vendor, { systemIds, totalCost, processCount }]) => ({
      vendor,
      systemCount: systemIds.size,
      totalAnnualCost: totalCost,
      processCount,
      lockInScore: Math.min(100, systemIds.size * 10 + processCount * 5),
    }))
    .sort((a, b) => b.lockInScore - a.lockInScore)
    .slice(0, 10);

  /* ---- Cycle participants ---- */
  const cycleParticipantCount = snapshot?.cycleNodeCount ?? detectCycleParticipants(outboundMap);

  /* ---- Aggregate score ---- */
  const rawScore =
    spofCandidates.slice(0, 3).reduce((sum, s) => sum + s.fragilityScore, 0) / 3 +
    fragileSystems.slice(0, 3).reduce((sum, s) => sum + s.fragilityScore, 0) / 6 +
    Math.min(20, cycleParticipantCount * 2) +
    Math.min(10, brokenRelationshipCount * 2);

  const aggregateFragilityScore = Math.min(100, Math.round(rawScore));

  return {
    aggregateFragilityScore,
    spofCandidates,
    fragileSystems,
    vendorLockIn,
    cycleParticipantCount,
    brokenRelationshipCount,
  };
}

/* ---- Cycle detection (fallback when no snapshot) ---- */
function detectCycleParticipants(outboundMap: Map<string, string[]>): number {
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const cycleNodes = new Set<string>();

  const dfs = (node: string) => {
    if (inStack.has(node)) {
      cycleNodes.add(node);
      return;
    }
    if (visited.has(node)) return;
    visited.add(node);
    inStack.add(node);
    for (const neighbor of outboundMap.get(node) ?? []) {
      dfs(neighbor);
    }
    inStack.delete(node);
  };

  for (const node of outboundMap.keys()) {
    if (!visited.has(node)) dfs(node);
  }
  return cycleNodes.size;
}
