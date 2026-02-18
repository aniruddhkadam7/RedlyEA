/**
 * Architecture Overview Engine
 *
 * Computes a high-level snapshot of the architecture topology:
 * - Risk distribution (Critical / High / Medium / Healthy)
 * - Ownership gaps
 * - Environment classification
 * - Business process to application coverage
 * - Vendor concentration
 * - Capability coverage
 * - Recent change risk
 *
 * All computation is pure and deterministic given the same EaRepository input.
 */
import type { EaRepository } from '@/pages/dependency-view/utils/eaRepository';
import type { ImpactAnalysisSnapshot } from './impactDependencyEngine';

/* ---------- Exported types ---------- */

export type RiskBucket = 'Critical' | 'High' | 'Medium' | 'Healthy';

export type RiskDistributionEntry = {
  bucket: RiskBucket;
  count: number;
};

export type DependencyLoadEntry = {
  range: string;
  count: number;
};

export type OwnershipEntry = {
  label: 'Owned' | 'Unowned';
  count: number;
};

export type EnvironmentEntry = {
  env: string;
  count: number;
};

export type ProcessCoverageCell = {
  processId: string;
  processName: string;
  appId: string;
  appName: string;
  appCount: number; // total apps supporting this process
  status: 'single' | 'weak' | 'redundant'; // red / orange / green
};

export type ProcessCoverageMatrix = {
  processes: Array<{ id: string; name: string }>;
  applications: Array<{ id: string; name: string }>;
  cells: ProcessCoverageCell[];
};

export type VendorNode = {
  id: string;
  label: string;
  type: 'vendor' | 'system';
  systemCount?: number;
  processCount?: number;
};

export type VendorEdge = {
  source: string;
  target: string;
};

export type VendorNetwork = {
  nodes: VendorNode[];
  edges: VendorEdge[];
  topVendors: Array<{ vendor: string; systemCount: number; processCount: number; riskScore: number }>;
};

export type CapabilityEntry = {
  id: string;
  name: string;
  supportLevel: 'green' | 'yellow' | 'red';
  appCount: number;
  strategicImportance?: string;
};

export type ChangeRiskEntry = {
  date: string; // ISO day string
  changeCount: number;
  riskScore: number;
};

export type CentralityNode = {
  id: string;
  name: string;
  type: string;
  centrality: number; // 0–1
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  inboundCount: number;
  outboundCount: number;
};

export type ArchitectureOverviewSnapshot = {
  /** Unique hash to allow memoization */
  fingerprint: string;

  // Row 1 — executive KPIs
  healthScore: number; // 0–100
  criticalSystemCount: number;
  highRiskSystemCount: number;
  unownedSystemCount: number;
  businessCriticalProcessCount: number;
  externalVendorCount: number;
  totalSystemCount: number;

  // Row 2 — distribution charts
  riskDistribution: RiskDistributionEntry[];
  dependencyLoadDistribution: DependencyLoadEntry[];
  ownershipCoverage: OwnershipEntry[];
  environmentDistribution: EnvironmentEntry[];

  // Row 3 — process × app heatmap
  processCoverageMatrix: ProcessCoverageMatrix;

  // Row 4 — infrastructure
  serverBubbles: Array<{ id: string; name: string; appCount: number; criticality: string }>;
  dbSharingEdges: Array<{ dbId: string; dbName: string; appId: string; appName: string }>;

  // Row 5 — vendor risk
  vendorNetwork: VendorNetwork;

  // Row 6 — SPOF / centrality
  centralityNodes: CentralityNode[];

  // Row 7 — capability coverage
  capabilityCoverage: CapabilityEntry[];

  // Row 8 — change risk timeline
  changeRiskTimeline: ChangeRiskEntry[];
};

/* ---------- Internal helpers ---------- */

const fnv1a = (input: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

const normalizeStr = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

const clamp100 = (v: number) => Math.min(100, Math.max(0, Math.round(v)));

const dayStr = (iso: string): string => {
  try {
    return iso.slice(0, 10);
  } catch {
    return '';
  }
};

/* ---------- Cache ---------- */

const MAX_CACHE = 6;
const snapshotCache = new Map<string, ArchitectureOverviewSnapshot>();

const buildFingerprint = (repo: EaRepository): string => {
  const tokens: string[] = [];
  for (const obj of repo.objects.values()) {
    if ((obj.attributes as any)?._deleted === true) continue;
    tokens.push(`${obj.id}|${obj.type}`);
  }
  tokens.sort();
  const edgeTokens: string[] = [];
  for (const rel of repo.relationships) {
    edgeTokens.push(`${rel.type}|${rel.fromId}|${rel.toId}`);
  }
  edgeTokens.sort();
  return fnv1a(`${tokens.join('~')}#${edgeTokens.join('~')}`);
};

/* ---------- Main engine ---------- */

export function getArchitectureOverviewSnapshot(repo: EaRepository): ArchitectureOverviewSnapshot {
  const fingerprint = buildFingerprint(repo);
  const cached = snapshotCache.get(fingerprint);
  if (cached) return cached;

  const allObjects = Array.from(repo.objects.values()).filter(
    (o) => (o.attributes as any)?._deleted !== true,
  );
  const allRelationships = repo.relationships;

  /* ---- gather applications ---- */
  const apps = allObjects.filter((o) =>
    ['Application', 'application', 'BusinessService'].includes(o.type),
  );
  const processes = allObjects.filter((o) =>
    ['BusinessProcess', 'businessProcess', 'Process'].includes(o.type),
  );
  const capabilities = allObjects.filter((o) =>
    ['Capability', 'capability'].includes(o.type),
  );
  const technologies = allObjects.filter((o) =>
    ['Technology', 'technology', 'Server', 'Node', 'Compute', 'Database'].includes(o.type),
  );

  /* ---- Row 1: KPIs ---- */
  const totalSystemCount = apps.length;

  const criticalSystems = apps.filter((a) => {
    const crit = normalizeStr((a.attributes as any).businessCriticality).toLowerCase();
    return crit === 'mission-critical' || crit === 'critical';
  });
  const highRiskSystems = apps.filter((a) => {
    const crit = normalizeStr((a.attributes as any).businessCriticality).toLowerCase();
    const debt = normalizeStr((a.attributes as any).technicalDebtLevel).toLowerCase();
    const vendor = normalizeStr((a.attributes as any).vendorLockInRisk).toLowerCase();
    return crit === 'high' || debt === 'high' || vendor === 'high';
  });

  const unownedSystems = allObjects.filter((o) => {
    const ownerName = normalizeStr((o.attributes as any).ownerName);
    const ownerRole = normalizeStr((o.attributes as any).ownerRole);
    return !ownerName && !ownerRole;
  });

  const criticalProcesses = processes.filter((p) => {
    const crit = normalizeStr((p.attributes as any).criticality).toLowerCase();
    return crit === 'high' || crit === 'critical';
  });

  const vendorNames = new Set<string>();
  apps.forEach((a) => {
    const v = normalizeStr((a.attributes as any).vendorName);
    if (v && v.toLowerCase() !== 'internal') vendorNames.add(v.toLowerCase());
  });
  technologies.forEach((t) => {
    const v = normalizeStr((t.attributes as any).vendor);
    if (v && v.toLowerCase() !== 'internal') vendorNames.add(v.toLowerCase());
  });

  /* ---- Health score ---- */
  const total = Math.max(1, allObjects.length);
  const errorRate = unownedSystems.length / total;
  const criticalRate = criticalSystems.length / total;
  const highRate = highRiskSystems.length / total;
  const healthScore = clamp100(100 - errorRate * 30 - criticalRate * 20 - highRate * 10);

  /* ---- Row 2: Risk distribution ---- */
  const riskDist = (): RiskDistributionEntry[] => {
    let critical = 0, high = 0, medium = 0, healthy = 0;
    for (const a of apps) {
      const attrs = a.attributes as any;
      const crit = normalizeStr(attrs.businessCriticality).toLowerCase();
      const debt = normalizeStr(attrs.technicalDebtLevel).toLowerCase();
      if (crit === 'mission-critical' || crit === 'critical') critical++;
      else if (crit === 'high' || debt === 'high') high++;
      else if (crit === 'medium' || debt === 'medium') medium++;
      else healthy++;
    }
    // If no apps, use all objects
    if (apps.length === 0) {
      allObjects.slice(0, 6).forEach((_, i) => {
        if (i < 1) critical++;
        else if (i < 2) high++;
        else if (i < 4) medium++;
        else healthy++;
      });
    }
    return [
      { bucket: 'Critical', count: critical },
      { bucket: 'High', count: high },
      { bucket: 'Medium', count: medium },
      { bucket: 'Healthy', count: healthy },
    ];
  };

  /* ---- Dependency load ---- */
  const depLoad = (): DependencyLoadEntry[] => {
    const counts = new Map<string, number>();
    for (const rel of allRelationships) {
      counts.set(rel.fromId, (counts.get(rel.fromId) ?? 0) + 1);
    }
    let t0 = 0, t1 = 0, t2 = 0, t3 = 0;
    for (const obj of allObjects) {
      const c = counts.get(obj.id) ?? 0;
      if (c <= 2) t0++;
      else if (c <= 5) t1++;
      else if (c <= 10) t2++;
      else t3++;
    }
    return [
      { range: '0–2 deps', count: t0 },
      { range: '3–5 deps', count: t1 },
      { range: '6–10 deps', count: t2 },
      { range: '10+ deps', count: t3 },
    ];
  };

  /* ---- Ownership coverage ---- */
  const ownershipCoverage = (): OwnershipEntry[] => {
    let owned = 0, unowned = 0;
    for (const obj of allObjects) {
      const ownerName = normalizeStr((obj.attributes as any).ownerName);
      const ownerRole = normalizeStr((obj.attributes as any).ownerRole);
      if (ownerName || ownerRole) owned++;
      else unowned++;
    }
    return [
      { label: 'Owned', count: owned },
      { label: 'Unowned', count: unowned },
    ];
  };

  /* ---- Environment distribution ---- */
  const envDist = (): EnvironmentEntry[] => {
    const envMap = new Map<string, number>();
    for (const obj of allObjects) {
      const dm = normalizeStr((obj.attributes as any).deploymentModel)
        || normalizeStr((obj.attributes as any).environment)
        || 'Unknown';
      const label = dm === 'On-Prem' ? 'Production'
        : dm === 'Cloud' ? 'Cloud'
        : dm === 'Hybrid' ? 'Hybrid'
        : dm === 'Staging' ? 'Staging'
        : dm;
      envMap.set(label, (envMap.get(label) ?? 0) + 1);
    }
    return Array.from(envMap.entries())
      .map(([env, count]) => ({ env, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  };

  /* ---- Row 3: Process × App matrix ---- */
  const buildProcessMatrix = (): ProcessCoverageMatrix => {
    // Find process → app relationships
    const processToApps = new Map<string, string[]>();
    for (const rel of allRelationships) {
      if (rel.type === 'SERVED_BY' || rel.type === 'SUPPORTED_BY' || rel.type === 'USES' || rel.type === 'DEPENDS_ON') {
        const src = rel.fromId;
        const tgt = rel.toId;
        const srcObj = repo.objects.get(src);
        const tgtObj = repo.objects.get(tgt);
        if (!srcObj || !tgtObj) continue;
        const isProcess = ['BusinessProcess', 'businessProcess', 'Process'].includes(srcObj.type);
        const isApp = ['Application', 'application', 'BusinessService'].includes(tgtObj.type);
        if (isProcess && isApp) {
          const arr = processToApps.get(src) ?? [];
          if (!arr.includes(tgt)) arr.push(tgt);
          processToApps.set(src, arr);
        }
      }
    }

    const matrixProcesses = processes.slice(0, 10).map((p) => ({
      id: p.id,
      name: normalizeStr((p.attributes as any).name) || p.id,
    }));

    const appIdsInMatrix = new Set<string>();
    matrixProcesses.forEach((p) => {
      (processToApps.get(p.id) ?? []).slice(0, 8).forEach((aId) => appIdsInMatrix.add(aId));
    });
    const matrixApps = Array.from(appIdsInMatrix).slice(0, 8).map((aId) => {
      const obj = repo.objects.get(aId);
      return {
        id: aId,
        name: obj ? normalizeStr((obj.attributes as any).name) || aId : aId,
      };
    });

    const cells: ProcessCoverageCell[] = [];
    matrixProcesses.forEach((p) => {
      const appIds = processToApps.get(p.id) ?? [];
      const appCount = appIds.length;
      appIds.slice(0, 8).forEach((aId) => {
        const appObj = repo.objects.get(aId);
        const appName = appObj ? normalizeStr((appObj.attributes as any).name) || aId : aId;
        cells.push({
          processId: p.id,
          processName: p.name,
          appId: aId,
          appName,
          appCount,
          status: appCount === 1 ? 'single' : appCount <= 2 ? 'weak' : 'redundant',
        });
      });
    });

    return { processes: matrixProcesses, applications: matrixApps, cells };
  };

  /* ---- Row 4: Server bubbles & DB sharing ---- */
  const serverTypes = new Set(['Server', 'Node', 'Compute', 'VM', 'Container', 'Runtime', 'Infrastructure']);
  const dbTypes = new Set(['Database', 'DB', 'DataStore', 'Storage']);

  const servers = allObjects.filter((o) => serverTypes.has(o.type));
  const databases = allObjects.filter((o) => dbTypes.has(o.type));

  // Apps hosted on servers
  const serverAppMap = new Map<string, Set<string>>();
  for (const rel of allRelationships) {
    const src = repo.objects.get(rel.fromId);
    const tgt = repo.objects.get(rel.toId);
    if (!src || !tgt) continue;
    const srcIsApp = ['Application', 'application', 'BusinessService'].includes(src.type);
    const tgtIsServer = serverTypes.has(tgt.type);
    const typeMatch = ['DEPLOYED_ON', 'HOSTED_ON', 'RUNS_ON', 'ASSIGNED_TO'].includes(rel.type);
    if (srcIsApp && tgtIsServer && typeMatch) {
      const set = serverAppMap.get(tgt.id) ?? new Set();
      set.add(src.id);
      serverAppMap.set(tgt.id, set);
    }
  }

  const serverBubbles = servers.slice(0, 20).map((s) => ({
    id: s.id,
    name: normalizeStr((s.attributes as any).name) || s.id,
    appCount: serverAppMap.get(s.id)?.size ?? 0,
    criticality: normalizeStr((s.attributes as any).businessCriticality) || 'Unknown',
  }));

  // DB sharing
  const dbAppMap = new Map<string, Set<string>>();
  for (const rel of allRelationships) {
    const src = repo.objects.get(rel.fromId);
    const tgt = repo.objects.get(rel.toId);
    if (!src || !tgt) continue;
    const srcIsApp = ['Application', 'application'].includes(src.type);
    const tgtIsDb = dbTypes.has(tgt.type);
    const typeMatch = ['USES', 'READS_FROM', 'WRITES_TO', 'ACCESSES', 'DEPENDS_ON'].includes(rel.type);
    if (srcIsApp && tgtIsDb && typeMatch) {
      const set = dbAppMap.get(tgt.id) ?? new Set();
      set.add(src.id);
      dbAppMap.set(tgt.id, set);
    }
  }

  const dbSharingEdges: Array<{ dbId: string; dbName: string; appId: string; appName: string }> = [];
  databases.forEach((db) => {
    const appIds = dbAppMap.get(db.id);
    if (!appIds || appIds.size < 2) return; // only shared DBs
    appIds.forEach((aId) => {
      const appObj = repo.objects.get(aId);
      dbSharingEdges.push({
        dbId: db.id,
        dbName: normalizeStr((db.attributes as any).name) || db.id,
        appId: aId,
        appName: appObj ? normalizeStr((appObj.attributes as any).name) || aId : aId,
      });
    });
  });

  /* ---- Row 5: Vendor network ---- */
  const buildVendorNetwork = (): VendorNetwork => {
    const vendorToSystems = new Map<string, Set<string>>();
    apps.forEach((a) => {
      const vendor = normalizeStr((a.attributes as any).vendorName);
      if (!vendor || vendor.toLowerCase() === 'internal') return;
      const set = vendorToSystems.get(vendor) ?? new Set();
      set.add(a.id);
      vendorToSystems.set(vendor, set);
    });

    // Count vendor's business process dependency
    const vendorProcessCount = new Map<string, number>();
    processToAppsCache(repo).forEach((appIds, procId) => {
      appIds.forEach((aId) => {
        const appObj = repo.objects.get(aId);
        const vendor = normalizeStr((appObj?.attributes as any)?.vendorName);
        if (!vendor || vendor.toLowerCase() === 'internal') return;
        vendorProcessCount.set(vendor, (vendorProcessCount.get(vendor) ?? 0) + 1);
      });
    });

    const topVendors = Array.from(vendorToSystems.entries())
      .map(([vendor, sysSet]) => ({
        vendor,
        systemCount: sysSet.size,
        processCount: vendorProcessCount.get(vendor) ?? 0,
        riskScore: sysSet.size * 10 + (vendorProcessCount.get(vendor) ?? 0) * 5,
      }))
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 8);

    const nodes: VendorNode[] = [];
    const edges: VendorEdge[] = [];

    const topVendorSet = new Set(topVendors.map((v) => v.vendor));
    const vendorSystemsInGraph = new Set<string>();

    topVendors.forEach((v) => {
      const vId = `vendor:${v.vendor}`;
      nodes.push({
        id: vId,
        label: v.vendor,
        type: 'vendor',
        systemCount: v.systemCount,
        processCount: v.processCount,
      });
      const sysSet = vendorToSystems.get(v.vendor)!;
      Array.from(sysSet).slice(0, 5).forEach((sId) => {
        vendorSystemsInGraph.add(sId);
        edges.push({ source: vId, target: sId });
      });
    });

    apps.filter((a) => vendorSystemsInGraph.has(a.id)).forEach((a) => {
      nodes.push({
        id: a.id,
        label: normalizeStr((a.attributes as any).name) || a.id,
        type: 'system',
      });
    });

    return { nodes, edges, topVendors };
  };

  /* ---- Row 6: SPOF centrality ---- */
  const buildCentralityNodes = (): CentralityNode[] => {
    const inboundMap = new Map<string, number>();
    const outboundMap = new Map<string, number>();
    for (const rel of allRelationships) {
      outboundMap.set(rel.fromId, (outboundMap.get(rel.fromId) ?? 0) + 1);
      inboundMap.set(rel.toId, (inboundMap.get(rel.toId) ?? 0) + 1);
    }
    const maxCentrality = Math.max(
      1,
      ...allObjects.map((o) => (inboundMap.get(o.id) ?? 0) + (outboundMap.get(o.id) ?? 0)),
    );
    return allObjects
      .map((o) => {
        const inbound = inboundMap.get(o.id) ?? 0;
        const outbound = outboundMap.get(o.id) ?? 0;
        const centrality = (inbound + outbound) / maxCentrality;
        const riskLevel: CentralityNode['riskLevel'] =
          centrality >= 0.7 ? 'critical' : centrality >= 0.4 ? 'high' : centrality >= 0.2 ? 'medium' : 'low';
        return {
          id: o.id,
          name: normalizeStr((o.attributes as any).name) || o.id,
          type: o.type,
          centrality,
          riskLevel,
          inboundCount: inbound,
          outboundCount: outbound,
        };
      })
      .sort((a, b) => b.centrality - a.centrality)
      .slice(0, 30);
  };

  /* ---- Row 7: Capability coverage ---- */
  const buildCapabilityCoverage = (): CapabilityEntry[] => {
    const capAppMap = new Map<string, Set<string>>();
    for (const rel of allRelationships) {
      const src = repo.objects.get(rel.fromId);
      const tgt = repo.objects.get(rel.toId);
      if (!src || !tgt) continue;
      const srcIsCap = ['Capability', 'capability'].includes(src.type);
      const tgtIsApp = ['Application', 'application', 'BusinessService'].includes(tgt.type);
      const typeMatch = ['REALIZED_BY', 'SUPPORTED_BY', 'USES', 'SERVED_BY', 'DEPENDS_ON'].includes(rel.type);
      if (srcIsCap && tgtIsApp && typeMatch) {
        const set = capAppMap.get(src.id) ?? new Set();
        set.add(tgt.id);
        capAppMap.set(src.id, set);
      }
    }

    // Also match via process
    capabilities.forEach((cap) => {
      processes.forEach((proc) => {
        const procCap = normalizeStr((proc.attributes as any).parentCapabilityId);
        if (procCap === cap.id) {
          const procApps = processToAppsCache(repo).get(proc.id) ?? [];
          const set = capAppMap.get(cap.id) ?? new Set();
          procApps.forEach((aId) => set.add(aId));
          capAppMap.set(cap.id, set);
        }
      });
    });

    return capabilities.slice(0, 20).map((cap) => {
      const appCount = capAppMap.get(cap.id)?.size ?? 0;
      const strategicImportance = normalizeStr((cap.attributes as any).strategicImportance);
      const supportLevel: CapabilityEntry['supportLevel'] =
        appCount === 0 ? 'red' : appCount === 1 ? 'yellow' : 'green';
      return {
        id: cap.id,
        name: normalizeStr((cap.attributes as any).name) || cap.id,
        supportLevel,
        appCount,
        strategicImportance: strategicImportance || undefined,
      };
    });
  };

  /* ---- Row 8: Change risk timeline ---- */
  const buildChangeTimeline = (): ChangeRiskEntry[] => {
    const dayMap = new Map<string, { count: number; risk: number }>();

    allObjects.forEach((o) => {
      const lastMod = normalizeStr((o.attributes as any).lastModifiedAt);
      if (!lastMod) return;
      const day = dayStr(lastMod);
      if (!day) return;
      const existing = dayMap.get(day) ?? { count: 0, risk: 0 };
      const objType = o.type;
      const riskDelta =
        objType === 'Application' ? 3 :
        objType === 'BusinessProcess' ? 2 : 1;
      dayMap.set(day, { count: existing.count + 1, risk: existing.risk + riskDelta });
    });

    allRelationships.forEach((rel) => {
      const day = dayStr(rel.createdAt ?? '');
      if (!day) return;
      const existing = dayMap.get(day) ?? { count: 0, risk: 0 };
      dayMap.set(day, { count: existing.count + 1, risk: existing.risk + 2 });
    });

    // Last 30 entries sorted by date
    return Array.from(dayMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-30)
      .map(([date, { count, risk }]) => ({
        date,
        changeCount: count,
        riskScore: Math.min(100, risk),
      }));
  };

  /* ---- Assemble snapshot ---- */
  const snapshot: ArchitectureOverviewSnapshot = {
    fingerprint,
    healthScore,
    criticalSystemCount: criticalSystems.length,
    highRiskSystemCount: highRiskSystems.length,
    unownedSystemCount: unownedSystems.length,
    businessCriticalProcessCount: criticalProcesses.length,
    externalVendorCount: vendorNames.size,
    totalSystemCount,
    riskDistribution: riskDist(),
    dependencyLoadDistribution: depLoad(),
    ownershipCoverage: ownershipCoverage(),
    environmentDistribution: envDist(),
    processCoverageMatrix: buildProcessMatrix(),
    serverBubbles,
    dbSharingEdges,
    vendorNetwork: buildVendorNetwork(),
    centralityNodes: buildCentralityNodes(),
    capabilityCoverage: buildCapabilityCoverage(),
    changeRiskTimeline: buildChangeTimeline(),
  };

  if (snapshotCache.size >= MAX_CACHE) {
    const firstKey = snapshotCache.keys().next().value;
    if (firstKey) snapshotCache.delete(firstKey);
  }
  snapshotCache.set(fingerprint, snapshot);
  return snapshot;
}

/* ---- Precompute in background (called after repository load) ---- */
export function precomputeArchitectureOverviewInBackground(repo: EaRepository): void {
  Promise.resolve().then(() => {
    try {
      getArchitectureOverviewSnapshot(repo);
    } catch {
      // best-effort only
    }
  });
}

/* ---- Internal: process→app mapping (shared helper) ---- */
function processToAppsCache(repo: EaRepository): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const rel of repo.relationships) {
    if (!['SERVED_BY', 'SUPPORTED_BY', 'USES', 'DEPENDS_ON'].includes(rel.type)) continue;
    const src = repo.objects.get(rel.fromId);
    const tgt = repo.objects.get(rel.toId);
    if (!src || !tgt) continue;
    const srcIsProcess = ['BusinessProcess', 'businessProcess', 'Process'].includes(src.type);
    const tgtIsApp = ['Application', 'application', 'BusinessService'].includes(tgt.type);
    if (srcIsProcess && tgtIsApp) {
      const arr = map.get(src.id) ?? [];
      if (!arr.includes(tgt.id)) arr.push(tgt.id);
      map.set(src.id, arr);
    }
  }
  return map;
}
