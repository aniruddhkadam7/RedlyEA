import type { GraphAbstractionLayer } from '../graph/GraphAbstractionLayer';
import { getGraphAbstractionLayer } from '../graph/GraphAbstractionLayerStore';
import type { BaseArchitectureRelationship } from '../repository/BaseArchitectureRelationship';
import type {
  ImpactAnalysisDirection,
  ImpactAnalysisRequest,
} from './ImpactAnalysisRequest';
import type {
  DependencyStrength,
  ImpactCriticality,
  ImpactPath,
} from './ImpactPath';

type Step = {
  nextElementId: string;
  relationshipId: string;
  relationship: BaseArchitectureRelationship;
};

const compareStrings = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const normalizeId = (value: string) => (value ?? '').trim();

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
  // Convert unsigned 32-bit to hex.
  return (hash >>> 0).toString(16).padStart(8, '0');
};

const stablePathId = (
  requestId: string,
  orderedElementIds: readonly string[],
  orderedRelationshipIds: readonly string[],
) => {
  const basis = `${requestId}|${orderedElementIds.join('>')}|${orderedRelationshipIds.join('>')}`;
  return `path_${fnv1aHex(basis)}`;
};

const relationshipSortKey = (r: BaseArchitectureRelationship) =>
  `${(r.relationshipType ?? '').trim()}|${normalizeId(r.sourceElementId)}|${normalizeId(r.targetElementId)}|${normalizeId(r.id)}`;

const stepSortKey = (s: Step) =>
  `${(s.relationship.relationshipType ?? '').trim()}|${normalizeId(s.nextElementId)}|${normalizeId(s.relationshipId)}`;

const dependencyStrengthFor = (
  r: BaseArchitectureRelationship,
): DependencyStrength => {
  // Only some relationship types carry dependencyStrength.
  const v = (r as unknown as { dependencyStrength?: unknown })
    .dependencyStrength;
  if (v === 'Hard' || v === 'Soft') return v;
  return 'Unknown';
};

const weakestStrengthOnPath = (
  relationships: readonly BaseArchitectureRelationship[],
): DependencyStrength => {
  // Weakest = most constraining: Hard > Soft > Unknown.
  let hasHard = false;
  let hasSoft = false;
  for (const r of relationships) {
    const s = dependencyStrengthFor(r);
    if (s === 'Hard') hasHard = true;
    else if (s === 'Soft') hasSoft = true;
  }
  if (hasHard) return 'Hard';
  if (hasSoft) return 'Soft';
  return 'Unknown';
};

/**
 * Enumerates ALL valid impact paths from a root element.
 *
 * Determinism:
 * - Relationship candidates are normalized and sorted.
 * - Adjacency lists are built and iterated in sorted order.
 * - No randomness, no caching.
 *
 * Notes:
 * - Paths are relationship-driven (no element-type filtering).
 * - Cycles are prevented per path (no node revisited in the same path).
 * - Returned paths are all prefixes of traversal sequences from the root up to maxDepth.
 */
export class ImpactPathEnumerator {
  private readonly graph: GraphAbstractionLayer;

  constructor(graph: GraphAbstractionLayer = getGraphAbstractionLayer()) {
    this.graph = graph;
  }

  async enumerateAllPaths(
    request: ImpactAnalysisRequest,
  ): Promise<ImpactPath[]> {
    const rootId = normalizeId(request.rootElementId);
    if (!rootId) return [];

    const maxDepth = request.maxDepth;
    if (typeof maxDepth !== 'number' || maxDepth <= 0) return [];

    const allowedRelationshipTypes = new Set(
      normalizeList(request.includedRelationshipTypes),
    );
    if (allowedRelationshipTypes.size === 0) return [];

    const relationshipById = new Map<string, BaseArchitectureRelationship>();
    const stepCache = new Map<string, Step[]>();

    const stepsFor = async (currentId: string): Promise<Step[]> => {
      const key = normalizeId(currentId);
      if (!key) return [];

      const cached = stepCache.get(key);
      if (cached) return cached;

      const steps: Step[] = [];

      if (includesDownstream(request.direction)) {
        const outgoing = (await this.graph.getOutgoingEdges(key))
          .filter((r) =>
            allowedRelationshipTypes.has((r.relationshipType ?? '').trim()),
          )
          .slice()
          .sort((a, b) =>
            compareStrings(relationshipSortKey(a), relationshipSortKey(b)),
          );

        for (const r of outgoing) {
          const relationshipId = normalizeId(r.id);
          const nextElementId = normalizeId(r.targetElementId);
          if (!relationshipId || !nextElementId) continue;
          relationshipById.set(relationshipId, r);
          steps.push({ nextElementId, relationshipId, relationship: r });
        }
      }

      if (includesUpstream(request.direction)) {
        const incoming = (await this.graph.getIncomingEdges(key))
          .filter((r) =>
            allowedRelationshipTypes.has((r.relationshipType ?? '').trim()),
          )
          .slice()
          .sort((a, b) =>
            compareStrings(relationshipSortKey(a), relationshipSortKey(b)),
          );

        for (const r of incoming) {
          const relationshipId = normalizeId(r.id);
          const nextElementId = normalizeId(r.sourceElementId);
          if (!relationshipId || !nextElementId) continue;
          relationshipById.set(relationshipId, r);
          steps.push({ nextElementId, relationshipId, relationship: r });
        }
      }

      steps.sort((a, b) => compareStrings(stepSortKey(a), stepSortKey(b)));
      stepCache.set(key, steps);
      return steps;
    };

    const results: ImpactPath[] = [];

    const visited = new Set<string>();
    const orderedElementIds: string[] = [rootId];
    const orderedRelationshipIds: string[] = [];

    visited.add(rootId);

    const pushPath = () => {
      const rels = orderedRelationshipIds
        .map((id) => relationshipById.get(id))
        .filter((r): r is BaseArchitectureRelationship => Boolean(r));

      const weakestDependencyStrength = weakestStrengthOnPath(rels);
      const containsHardDependency = weakestDependencyStrength === 'Hard';

      // Criticality is not computed by this service (reserved for later prompts).
      const maxCriticalityOnPath: ImpactCriticality = 'Unknown';

      results.push({
        pathId: stablePathId(
          request.requestId,
          orderedElementIds,
          orderedRelationshipIds,
        ),
        orderedElementIds: orderedElementIds.slice(),
        orderedRelationshipIds: orderedRelationshipIds.slice(),
        pathLength: orderedRelationshipIds.length,
        containsHardDependency,
        weakestDependencyStrength,
        maxCriticalityOnPath,
      });
    };

    const dfs = async (currentId: string, depth: number): Promise<void> => {
      if (depth >= maxDepth) return;

      const steps = await stepsFor(currentId);
      for (const step of steps) {
        const nextId = normalizeId(step.nextElementId);
        if (!nextId) continue;
        if (visited.has(nextId)) continue;

        visited.add(nextId);
        orderedElementIds.push(nextId);
        orderedRelationshipIds.push(step.relationshipId);

        // Record this path (root -> current leaf).
        pushPath();

        await dfs(nextId, depth + 1);

        orderedRelationshipIds.pop();
        orderedElementIds.pop();
        visited.delete(nextId);
      }
    };

    await dfs(rootId, 0);

    // Deterministic output order even if future refactors change traversal.
    results.sort(
      (a, b) =>
        a.pathLength - b.pathLength ||
        compareStrings(
          a.orderedElementIds.join('>'),
          b.orderedElementIds.join('>'),
        ) ||
        compareStrings(a.pathId, b.pathId),
    );

    return results;
  }
}

export const impactPathEnumerator = new ImpactPathEnumerator();
