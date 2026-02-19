import { CACHE_POLICY } from '../cache/CachePolicy';
import { RevisionedTtlCache } from '../cache/RevisionedTtlCache';
import type { GraphAbstractionLayer } from '../graph/GraphAbstractionLayer';
import { getGraphAbstractionLayer } from '../graph/GraphAbstractionLayerStore';
import { getRelationshipEndpointRule } from '../relationships/RelationshipSemantics';
import type { BaseArchitectureElement } from '../repository/BaseArchitectureElement';
import type { BaseArchitectureRelationship } from '../repository/BaseArchitectureRelationship';
import { getRelationshipRepositoryRevision } from '../repository/RelationshipRepositoryStore';
import { getRepositoryRevision } from '../repository/RepositoryStore';
import { telemetry } from '../telemetry/Telemetry';
import type { ViewDefinition } from './ViewDefinition';
import { getViewRepositoryRevision } from './ViewRepositoryStore';

export type ResolvedViewData = {
  viewId: string;
  elementIds: readonly string[];
  elements: readonly BaseArchitectureElement[];
  relationships: readonly BaseArchitectureRelationship[];
  stats: {
    eligibleElements: number;
    eligibleRelationships: number;
    selectedElements: number;
    selectedRelationships: number;
    rootElementId?: string;
    maxDepth?: number;
  };
};

const normalizeList = (values: readonly string[]) =>
  Array.from(
    new Set(
      (values ?? [])
        .map((v) => (typeof v === 'string' ? v.trim() : ''))
        .filter((v) => v.length > 0),
    ),
  ).sort((a, b) => a.localeCompare(b));

const normalizeId = (value: string) => (value ?? '').trim();

const viewCache = new RevisionedTtlCache<ResolvedViewData>({
  ttlMs: CACHE_POLICY.viewResolution.ttlMs,
  maxEntries: CACHE_POLICY.viewResolution.maxEntries,
});

const cacheRevisionKey = () =>
  `${getRepositoryRevision()}|${getRelationshipRepositoryRevision()}|${getViewRepositoryRevision()}`;

const viewCacheKey = (view: ViewDefinition): string => {
  const allowedElementTypes = normalizeList(view.allowedElementTypes);
  const allowedRelationshipTypes = normalizeList(view.allowedRelationshipTypes);
  const rootId = normalizeId(view.rootElementId ?? '');
  const maxDepth =
    typeof view.maxDepth === 'number' ? String(view.maxDepth) : '';
  return [
    'view',
    normalizeId(view.id),
    normalizeId(view.viewType),
    rootId,
    maxDepth,
    allowedElementTypes.join(','),
    allowedRelationshipTypes.join(','),
  ].join('|');
};

const isAllowedRelationshipType = (
  allowedRelationshipTypes: ReadonlySet<string>,
  relationshipType: string,
): boolean => {
  const t = (relationshipType ?? '').trim();
  if (!t) return false;
  if (!allowedRelationshipTypes.has(t)) return false;
  // Ensure semantics exist, otherwise we cannot safely project.
  return Boolean(getRelationshipEndpointRule(t));
};

const relationshipConnectsEligibleTypes = (
  relationship: BaseArchitectureRelationship,
  allowedElementTypes: ReadonlySet<string>,
): boolean => {
  const fromType = (relationship.sourceElementType ?? '').trim();
  const toType = (relationship.targetElementType ?? '').trim();
  if (!fromType || !toType) return false;
  return allowedElementTypes.has(fromType) && allowedElementTypes.has(toType);
};

/**
 * ViewResolver (data selection only).
 *
 * Deterministic rules:
 * - Only includes elements whose elementType is in view.allowedElementTypes.
 * - Only includes relationships whose relationshipType is in view.allowedRelationshipTypes.
 * - Only includes relationships where both endpoints are included.
 * - If rootElementId is present: performs a bounded traversal using OUTGOING relationships.
 * - If maxDepth is present with a root: includes nodes within <= maxDepth hops.
 */
export class ViewResolver {
  private readonly graph: GraphAbstractionLayer;

  constructor(graph: GraphAbstractionLayer = getGraphAbstractionLayer()) {
    this.graph = graph;
  }

  async resolve(view: ViewDefinition): Promise<ResolvedViewData> {
    const startedAtMs = telemetry.nowMs();
    const revisionKey = cacheRevisionKey();
    const cacheKey = viewCacheKey(view);
    const cached = viewCache.get(cacheKey, revisionKey);
    if (cached) {
      telemetry.record({
        name: 'view.resolve',
        durationMs: telemetry.nowMs() - startedAtMs,
        tags: { viewId: view.id, cached: true },
        metrics: {
          traversalDepth: cached.stats.maxDepth ?? 0,
          nodesVisited: cached.elements.length,
          pathsEnumerated: 0,
        },
      });
      return cached;
    }

    const allowedElementTypes = new Set(
      normalizeList(view.allowedElementTypes),
    );
    const allowedRelationshipTypes = new Set(
      normalizeList(view.allowedRelationshipTypes),
    );

    const eligibleElementsNested = await Promise.all(
      Array.from(allowedElementTypes).map((t) => this.graph.getNodesByType(t)),
    );

    const eligibleElements = eligibleElementsNested
      .flat()
      .filter((e) => allowedElementTypes.has((e.elementType ?? '').trim()))
      .slice()
      .sort(
        (a, b) =>
          a.elementType.localeCompare(b.elementType) ||
          a.name.localeCompare(b.name) ||
          a.id.localeCompare(b.id),
      );

    const eligibleElementIdSet = new Set(eligibleElements.map((e) => e.id));

    const eligibleRelationshipById = new Map<
      string,
      BaseArchitectureRelationship
    >();
    for (const sourceId of eligibleElementIdSet) {
      const outgoing = await this.graph.getOutgoingEdges(sourceId);
      for (const r of outgoing) {
        if (
          !isAllowedRelationshipType(
            allowedRelationshipTypes,
            r.relationshipType,
          )
        )
          continue;
        if (!relationshipConnectsEligibleTypes(r, allowedElementTypes))
          continue;
        if (!eligibleElementIdSet.has(r.targetElementId)) continue;
        eligibleRelationshipById.set(r.id, r);
      }
    }

    const eligibleRelationships = Array.from(
      eligibleRelationshipById.values(),
    ).sort(
      (a, b) =>
        a.relationshipType.localeCompare(b.relationshipType) ||
        a.sourceElementId.localeCompare(b.sourceElementId) ||
        a.targetElementId.localeCompare(b.targetElementId) ||
        a.id.localeCompare(b.id),
    );

    const rootId = normalizeId(view.rootElementId ?? '');
    const maxDepth =
      typeof view.maxDepth === 'number' ? view.maxDepth : undefined;

    // No root => global projection (all eligible elements/relationships).
    if (!rootId) {
      const relationships = eligibleRelationships.filter(
        (r) =>
          eligibleElementIdSet.has(r.sourceElementId) &&
          eligibleElementIdSet.has(r.targetElementId),
      );

      const resolved: ResolvedViewData = {
        viewId: view.id,
        elementIds: eligibleElements.map((e) => e.id),
        elements: eligibleElements,
        relationships,
        stats: {
          eligibleElements: eligibleElements.length,
          eligibleRelationships: eligibleRelationships.length,
          selectedElements: eligibleElements.length,
          selectedRelationships: relationships.length,
          maxDepth,
        },
      };

      viewCache.set(cacheKey, revisionKey, resolved);

      telemetry.record({
        name: 'view.resolve',
        durationMs: telemetry.nowMs() - startedAtMs,
        tags: { viewId: view.id, cached: false, rooted: false },
        metrics: {
          traversalDepth: 0,
          nodesVisited: resolved.elements.length,
          pathsEnumerated: 0,
        },
      });

      return resolved;
    }

    // Rooted projection.
    const rootElement = await this.graph.getNode(rootId);
    if (
      !rootElement ||
      !allowedElementTypes.has((rootElement.elementType ?? '').trim())
    ) {
      // Deterministic empty selection when root is invalid/out of scope.
      const resolved: ResolvedViewData = {
        viewId: view.id,
        elementIds: [],
        elements: [],
        relationships: [],
        stats: {
          eligibleElements: eligibleElements.length,
          eligibleRelationships: eligibleRelationships.length,
          selectedElements: 0,
          selectedRelationships: 0,
          rootElementId: rootId,
          maxDepth,
        },
      };

      viewCache.set(cacheKey, revisionKey, resolved);

      telemetry.record({
        name: 'view.resolve',
        durationMs: telemetry.nowMs() - startedAtMs,
        tags: { viewId: view.id, cached: false, rooted: true, empty: true },
        metrics: {
          traversalDepth: 0,
          nodesVisited: 0,
          pathsEnumerated: 0,
        },
      });

      return resolved;
    }

    const adjacency = new Map<string, BaseArchitectureRelationship[]>();
    const adjacencyFor = async (
      fromId: string,
    ): Promise<BaseArchitectureRelationship[]> => {
      const from = normalizeId(fromId);
      if (!from) return [];
      const cached = adjacency.get(from);
      if (cached) return cached;

      const outgoing = (await this.graph.getOutgoingEdges(from))
        .filter((r) =>
          isAllowedRelationshipType(
            allowedRelationshipTypes,
            r.relationshipType,
          ),
        )
        .filter((r) =>
          relationshipConnectsEligibleTypes(r, allowedElementTypes),
        )
        .filter((r) => eligibleElementIdSet.has(r.targetElementId))
        .slice();

      adjacency.set(from, outgoing);
      return outgoing;
    };

    // BFS traversal for deterministic depth-bounded selection.
    const distances = new Map<string, number>();
    const queue: string[] = [];

    distances.set(rootId, 0);
    queue.push(rootId);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const currentDepth = distances.get(current) ?? 0;

      if (typeof maxDepth === 'number' && currentDepth >= maxDepth) continue;

      const outgoing = (await adjacencyFor(current)).slice();
      // Deterministic exploration.
      outgoing.sort(
        (a, b) =>
          a.relationshipType.localeCompare(b.relationshipType) ||
          a.targetElementId.localeCompare(b.targetElementId) ||
          a.id.localeCompare(b.id),
      );

      for (const rel of outgoing) {
        const next = normalizeId(rel.targetElementId);
        if (!next) continue;
        if (!distances.has(next)) {
          distances.set(next, currentDepth + 1);
          queue.push(next);
        }
      }
    }

    const selectedIds = Array.from(distances.entries())
      .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
      .map(([id]) => id);

    const maxDepthObserved = Array.from(distances.values()).reduce(
      (m, d) => Math.max(m, d),
      0,
    );

    const selectedIdSet = new Set(selectedIds);

    const selectedElementsResolved = (
      await Promise.all(selectedIds.map((id) => this.graph.getNode(id)))
    )
      .filter((e): e is BaseArchitectureElement => Boolean(e))
      .sort(
        (a, b) =>
          (distances.get(a.id) ?? 0) - (distances.get(b.id) ?? 0) ||
          a.name.localeCompare(b.name) ||
          a.id.localeCompare(b.id),
      );

    const selectedRelationships = eligibleRelationships.filter(
      (r) =>
        selectedIdSet.has(r.sourceElementId) &&
        selectedIdSet.has(r.targetElementId),
    );

    const resolved: ResolvedViewData = {
      viewId: view.id,
      elementIds: selectedIds,
      elements: selectedElementsResolved,
      relationships: selectedRelationships,
      stats: {
        eligibleElements: eligibleElements.length,
        eligibleRelationships: eligibleRelationships.length,
        selectedElements: selectedElementsResolved.length,
        selectedRelationships: selectedRelationships.length,
        rootElementId: rootId,
        maxDepth,
      },
    };

    viewCache.set(cacheKey, revisionKey, resolved);

    telemetry.record({
      name: 'view.resolve',
      durationMs: telemetry.nowMs() - startedAtMs,
      tags: { viewId: view.id, cached: false, rooted: true },
      metrics: {
        traversalDepth: maxDepthObserved,
        nodesVisited: distances.size,
        pathsEnumerated: 0,
      },
    });

    return resolved;
  }
}

export const viewResolver = new ViewResolver();
