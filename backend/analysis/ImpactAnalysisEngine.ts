import type { GraphAbstractionLayer } from '../graph/GraphAbstractionLayer';
import { getGraphAbstractionLayer } from '../graph/GraphAbstractionLayerStore';

import type { ImpactAnalysisRequest, ImpactAnalysisDirection } from './ImpactAnalysisRequest';
import type { ImpactPath, DependencyStrength, ImpactCriticality } from './ImpactPath';
import type { BaseArchitectureRelationship } from '../repository/BaseArchitectureRelationship';
import type { ImpactedElementEvidence } from './ImpactedElementDeriver';
import { telemetry } from '../telemetry/Telemetry';
import { DomainError } from '../reliability/DomainError';

const compareStrings = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const normalizeId = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const normalizeList = (values: readonly string[]) =>
  Array.from(
    new Set(
      (values ?? [])
        .map((v) => (typeof v === 'string' ? v.trim() : ''))
        .filter((v) => v.length > 0),
    ),
  ).sort(compareStrings);

const includesDownstream = (direction: ImpactAnalysisDirection) =>
  direction === 'Downstream' || direction === 'Bidirectional';

const includesUpstream = (direction: ImpactAnalysisDirection) =>
  direction === 'Upstream' || direction === 'Bidirectional';

const fnv1aHex = (input: string): string => {
  // Deterministic, fast hash for stable ids (not cryptographic).
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

const stablePathId = (requestId: string, orderedElementIds: readonly string[], orderedRelationshipIds: readonly string[]) => {
  const basis = `${requestId}|${orderedElementIds.join('>')}|${orderedRelationshipIds.join('>')}`;
  return `path_${fnv1aHex(basis)}`;
};

const relationshipSortKey = (r: BaseArchitectureRelationship) =>
  `${(r.relationshipType ?? '').trim()}|${normalizeId(r.sourceElementId)}|${normalizeId(r.targetElementId)}|${normalizeId(r.id)}`;

const dependencyStrengthFor = (r: BaseArchitectureRelationship): DependencyStrength => {
  const v = (r as unknown as { dependencyStrength?: unknown }).dependencyStrength;
  if (v === 'Hard' || v === 'Soft') return v;
  return 'Unknown';
};

export type ImpactAnalysisEngineResult = {
  /** Optional full path list (root→leaf prefixes). */
  paths?: readonly ImpactPath[];
  /** Per-element evidence derived from the (conceptual) same path set. */
  evidence: readonly ImpactedElementEvidence[];
  /** Explicit warnings when safeguards/degradation are triggered. */
  warnings: readonly string[];
  /** Execution stats useful for audits and operational visibility. */
  stats: {
    expandedNodeCount: number;
    enumeratedPathCount: number;
    aborted: boolean;
    abortedReason?: 'UserAbort' | 'Safeguards' | 'Timeout';
    integrityIssueCount: number;
  };
};

export type ImpactQuerySafeguards = {
  /** Maximum distinct nodes whose adjacency is expanded (steps computed) per request. */
  maxTraversalNodes: number;
  /** Maximum number of path-prefixes (root→leaf prefixes) enumerated per request. */
  maxPathCount: number;
};

const defaultSafeguards: ImpactQuerySafeguards = {
  // Conservative defaults; can be tuned later based on NFRs and benchmarks.
  maxTraversalNodes: 25_000,
  maxPathCount: 250_000,
};

/**
 * ImpactAnalysisEngine
 *
 * Optimization strategy (no approximation, no cross-request caching):
 * - Early cutoff on depth (maxDepth).
 * - Per-request memoization of adjacency reads (nodeId → filtered, sorted steps).
 * - Avoid allocating/storing full path objects unless explicitly requested.
 */
export class ImpactAnalysisEngine {
  private readonly graph: GraphAbstractionLayer;

  constructor(graph: GraphAbstractionLayer = getGraphAbstractionLayer()) {
    this.graph = graph;
  }

  async analyze(
    request: ImpactAnalysisRequest,
    options: {
      includePaths: boolean;
      safeguards?: Partial<ImpactQuerySafeguards>;
      abortSignal?: AbortSignal;
      /** Optional analysis deadline (hard stop). */
      timeoutMs?: number;
    },
  ): Promise<ImpactAnalysisEngineResult> {
    const startedAtMs = telemetry.nowMs();
    const rootId = normalizeId(request.rootElementId);
    if (!rootId) {
      return {
        evidence: [],
        warnings: ['Invalid request: rootElementId is required.'],
        stats: { expandedNodeCount: 0, enumeratedPathCount: 0, aborted: false, integrityIssueCount: 0 },
      };
    }

    const maxDepth = request.maxDepth;
    if (typeof maxDepth !== 'number' || maxDepth <= 0) {
      return {
        evidence: [],
        warnings: ['Invalid request: maxDepth must be > 0.'],
        stats: { expandedNodeCount: 0, enumeratedPathCount: 0, aborted: false, integrityIssueCount: 0 },
      };
    }

    const allowedRelationshipTypes = new Set(normalizeList(request.includedRelationshipTypes));
    if (allowedRelationshipTypes.size === 0) {
      return {
        evidence: [],
        warnings: ['Invalid request: includedRelationshipTypes must be non-empty.'],
        stats: { expandedNodeCount: 0, enumeratedPathCount: 0, aborted: false, integrityIssueCount: 0 },
      };
    }

    const safeguards: ImpactQuerySafeguards = {
      maxTraversalNodes:
        typeof options.safeguards?.maxTraversalNodes === 'number'
          ? Math.max(1, Math.trunc(options.safeguards.maxTraversalNodes))
          : defaultSafeguards.maxTraversalNodes,
      maxPathCount:
        typeof options.safeguards?.maxPathCount === 'number'
          ? Math.max(1, Math.trunc(options.safeguards.maxPathCount))
          : defaultSafeguards.maxPathCount,
    };

    const warnings: string[] = [];
    let aborted = false;
    let abortedReason: 'UserAbort' | 'Safeguards' | 'Timeout' | undefined;
    let expandedNodeCount = 0;
    let enumeratedPathCount = 0;
    let maxDepthReached = 0;
    let integrityIssueCount = 0;

    const timeoutMs = typeof options.timeoutMs === 'number' ? Math.max(1, Math.trunc(options.timeoutMs)) : undefined;
    const deadlineAtMs = timeoutMs ? startedAtMs + timeoutMs : undefined;

    const ensureAbort = (reason: 'UserAbort' | 'Safeguards' | 'Timeout', message: string) => {
      if (aborted) return;
      aborted = true;
      abortedReason = reason;
      warnings.push(message);
    };

    const abortIfSignaled = () => {
      if (options.abortSignal?.aborted) ensureAbort('UserAbort', 'Traversal aborted: user requested abort.');
    };

    const abortIfTimedOut = () => {
      if (!deadlineAtMs) return;
      if (telemetry.nowMs() >= deadlineAtMs) {
        ensureAbort('Timeout', `Traversal aborted: timeoutMs=${timeoutMs} exceeded.`);
      }
    };

    // Integrity check: root must exist. Do not auto-repair.
    abortIfSignaled();
    abortIfTimedOut();
    if (aborted) {
      return {
        evidence: [],
        warnings: warnings.sort(compareStrings),
        stats: {
          expandedNodeCount,
          enumeratedPathCount,
          aborted,
          abortedReason,
          integrityIssueCount,
        },
      };
    }

    const root = await this.graph.getNode(rootId);
    if (!root) {
      throw new DomainError({
        code: 'DATA_INTEGRITY_ERROR',
        message: `Root element not found: ${rootId}`,
        retryable: false,
        details: { rootElementId: rootId },
      });
    }

    const expandedNodeSet = new Set<string>();

    type Step = { nextElementId: string; relationshipId: string; relationship: BaseArchitectureRelationship };

    const relationshipById = new Map<string, BaseArchitectureRelationship>();
    const stepCache = new Map<string, Step[]>();

    const stepsFor = async (currentIdRaw: string): Promise<Step[]> => {
      abortIfSignaled();
      abortIfTimedOut();
      if (aborted) return [];

      const currentId = normalizeId(currentIdRaw);
      if (!currentId) return [];

      if (!expandedNodeSet.has(currentId)) {
        expandedNodeSet.add(currentId);
        expandedNodeCount += 1;
        if (expandedNodeCount > safeguards.maxTraversalNodes) {
          ensureAbort(
            'Safeguards',
            `Traversal aborted: maxTraversalNodes=${safeguards.maxTraversalNodes} exceeded (expandedNodeCount=${expandedNodeCount}).`,
          );
          return [];
        }
      }

      const cached = stepCache.get(currentId);
      if (cached) return cached;

      const steps: Step[] = [];

      if (includesDownstream(request.direction)) {
        const outgoing = (await this.graph.getOutgoingEdges(currentId))
          .filter((r) => allowedRelationshipTypes.has((r.relationshipType ?? '').trim()))
          .slice()
          .sort((a, b) => compareStrings(relationshipSortKey(a), relationshipSortKey(b)));

        for (const r of outgoing) {
          abortIfSignaled();
          abortIfTimedOut();
          if (aborted) return [];

          const relationshipId = normalizeId(r.id);
          const nextElementId = normalizeId(r.targetElementId);
          const sourceType = typeof r.sourceElementType === 'string' ? r.sourceElementType.trim() : '';
          const targetType = typeof r.targetElementType === 'string' ? r.targetElementType.trim() : '';
          if (!relationshipId || !nextElementId || !sourceType || !targetType) {
            integrityIssueCount += 1;
            if (integrityIssueCount <= 5) {
              warnings.push(
                `Integrity issue: malformed relationship encountered during traversal (skipped).`,
              );
            }
            continue;
          }

          relationshipById.set(relationshipId, r);
          steps.push({ nextElementId, relationshipId, relationship: r });
        }
      }

      if (includesUpstream(request.direction)) {
        const incoming = (await this.graph.getIncomingEdges(currentId))
          .filter((r) => allowedRelationshipTypes.has((r.relationshipType ?? '').trim()))
          .slice()
          .sort((a, b) => compareStrings(relationshipSortKey(a), relationshipSortKey(b)));

        for (const r of incoming) {
          abortIfSignaled();
          abortIfTimedOut();
          if (aborted) return [];

          const relationshipId = normalizeId(r.id);
          const nextElementId = normalizeId(r.sourceElementId);
          const sourceType = typeof r.sourceElementType === 'string' ? r.sourceElementType.trim() : '';
          const targetType = typeof r.targetElementType === 'string' ? r.targetElementType.trim() : '';
          if (!relationshipId || !nextElementId || !sourceType || !targetType) {
            integrityIssueCount += 1;
            if (integrityIssueCount <= 5) {
              warnings.push(
                `Integrity issue: malformed relationship encountered during traversal (skipped).`,
              );
            }
            continue;
          }

          relationshipById.set(relationshipId, r);
          steps.push({ nextElementId, relationshipId, relationship: r });
        }
      }

      // Deterministic candidate order.
      steps.sort(
        (a, b) =>
          compareStrings((a.relationship.relationshipType ?? '').trim(), (b.relationship.relationshipType ?? '').trim()) ||
          compareStrings(a.nextElementId, b.nextElementId) ||
          compareStrings(a.relationshipId, b.relationshipId),
      );

      stepCache.set(currentId, steps);
      return steps;
    };

    // Evidence accumulator (exact, deterministic).
    const evidenceByElementId = new Map<string, ImpactedElementEvidence>();

    const ensureEvidence = (elementId: string): ImpactedElementEvidence => {
      const id = normalizeId(elementId);
      let ev = evidenceByElementId.get(id);
      if (!ev) {
        ev = {
          elementId: id,
          totalPathsAffectingElement: 0,
          hardPathCount: 0,
          softOnlyPathCount: 0,
          maxDepthObserved: 0,
        };
        evidenceByElementId.set(id, ev);
      }
      return ev;
    };

    // Traversal state.
    const visited = new Set<string>();
    const orderedElementIds: string[] = [rootId];
    const orderedRelationshipIds: string[] = [];

    // Track dependency characteristics on the current path prefix.
    let hasHardOnPrefix = false;
    let hasSoftOnPrefix = false;

    // If includePaths=false, we skip path object allocation entirely.
    const paths: ImpactPath[] = [];

    const recordCurrentPrefix = () => {
      abortIfSignaled();
      abortIfTimedOut();
      if (aborted) return;

      // Prefix excludes root-only (we only record after at least one relationship).
      const pathLength = orderedRelationshipIds.length;
      if (pathLength <= 0) return;

      if (pathLength > maxDepthReached) maxDepthReached = pathLength;

      enumeratedPathCount += 1;
      if (enumeratedPathCount > safeguards.maxPathCount) {
        ensureAbort(
          'Safeguards',
          `Traversal aborted: maxPathCount=${safeguards.maxPathCount} exceeded (enumeratedPathCount=${enumeratedPathCount}).`,
        );
        return;
      }

      const weakestDependencyStrength: DependencyStrength = hasHardOnPrefix
        ? 'Hard'
        : hasSoftOnPrefix
          ? 'Soft'
          : 'Unknown';

      const containsHardDependency = weakestDependencyStrength === 'Hard';

      // Criticality is not computed by this service (reserved for later prompts).
      const maxCriticalityOnPath: ImpactCriticality = 'Unknown';

      // Update evidence for every element on this prefix (excluding root).
      for (let index = 1; index < orderedElementIds.length; index += 1) {
        const elementId = normalizeId(orderedElementIds[index]);
        if (!elementId) continue;

        const ev = ensureEvidence(elementId);
        ev.totalPathsAffectingElement += 1;

        if (containsHardDependency) ev.hardPathCount += 1;
        else if (weakestDependencyStrength === 'Soft') ev.softOnlyPathCount += 1;

        if (index > ev.maxDepthObserved) ev.maxDepthObserved = index;
      }

      if (!options.includePaths) return;

      paths.push({
        pathId: stablePathId(request.requestId, orderedElementIds, orderedRelationshipIds),
        orderedElementIds: orderedElementIds.slice(),
        orderedRelationshipIds: orderedRelationshipIds.slice(),
        pathLength,
        containsHardDependency,
        weakestDependencyStrength,
        maxCriticalityOnPath,
      });
    };

    const dfs = async (currentId: string, depth: number): Promise<void> => {
      abortIfSignaled();
      abortIfTimedOut();
      if (aborted) return;
      if (depth >= maxDepth) return;

      const steps = await stepsFor(currentId);
      for (const step of steps) {
        abortIfSignaled();
        abortIfTimedOut();
        if (aborted) return;
        const nextId = normalizeId(step.nextElementId);
        if (!nextId) continue;
        if (visited.has(nextId)) continue;

        // Push.
        visited.add(nextId);
        orderedElementIds.push(nextId);
        orderedRelationshipIds.push(step.relationshipId);

        const prevHasHard = hasHardOnPrefix;
        const prevHasSoft = hasSoftOnPrefix;

        const strength = dependencyStrengthFor(step.relationship);
        if (strength === 'Hard') hasHardOnPrefix = true;
        else if (strength === 'Soft') hasSoftOnPrefix = true;

        recordCurrentPrefix();

        if (aborted) {
          // Ensure we unwind state deterministically.
          hasHardOnPrefix = prevHasHard;
          hasSoftOnPrefix = prevHasSoft;
          orderedRelationshipIds.pop();
          orderedElementIds.pop();
          visited.delete(nextId);
          return;
        }

        await dfs(nextId, depth + 1);

        // Pop.
        hasHardOnPrefix = prevHasHard;
        hasSoftOnPrefix = prevHasSoft;

        orderedRelationshipIds.pop();
        orderedElementIds.pop();
        visited.delete(nextId);
      }
    };

    visited.add(rootId);
    await dfs(rootId, 0);

    if (integrityIssueCount > 5) {
      warnings.push(`Integrity issue: ${integrityIssueCount} malformed relationships were skipped during traversal.`);
    }

    telemetry.record({
      name: 'impact.analysis',
      durationMs: telemetry.nowMs() - startedAtMs,
      tags: {
        requestId: request.requestId,
        rootElementId: request.rootElementId,
        direction: request.direction,
        includePaths: options.includePaths,
        aborted,
      },
      metrics: {
        traversalDepth: maxDepthReached,
        nodesVisited: expandedNodeCount,
        pathsEnumerated: enumeratedPathCount,
      },
    });

    // Deterministic output ordering.
    const evidence = Array.from(evidenceByElementId.values()).sort((a, b) => compareStrings(a.elementId, b.elementId));

    if (!options.includePaths) {
      return {
        evidence,
        warnings: warnings.sort(compareStrings),
        stats: {
          expandedNodeCount,
          enumeratedPathCount,
          aborted,
          abortedReason,
          integrityIssueCount,
        },
      };
    }

    paths.sort(
      (a, b) =>
        a.pathLength - b.pathLength ||
        compareStrings(a.orderedElementIds.join('>'), b.orderedElementIds.join('>')) ||
        compareStrings(a.pathId, b.pathId),
    );

    return {
      paths,
      evidence,
      warnings: warnings.sort(compareStrings),
      stats: {
        expandedNodeCount,
        enumeratedPathCount,
        aborted,
        abortedReason,
        integrityIssueCount,
      },
    };
  }
}

export const impactAnalysisEngine = new ImpactAnalysisEngine();
