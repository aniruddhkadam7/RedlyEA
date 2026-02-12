import type { GraphAbstractionLayer } from './GraphAbstractionLayer';
import { RepositoryGraphAbstractionLayer } from './RepositoryGraphAbstractionLayer';
import type { BaseArchitectureElement } from '../repository/BaseArchitectureElement';
import type { BaseArchitectureRelationship } from '../repository/BaseArchitectureRelationship';
import { getRepository, getRepositoryRevision } from '../repository/RepositoryStore';
import { getRelationshipRepository, getRelationshipRepositoryRevision } from '../repository/RelationshipRepositoryStore';
import { CACHE_POLICY } from '../cache/CachePolicy';
import { RevisionedTtlCache } from '../cache/RevisionedTtlCache';
import { telemetry } from '../telemetry/Telemetry';

/**
 * Default runtime GAL.
 *
 * Note:
 * - We keep this as a stable object, but delegate to the current repository/relationship singletons.
 * - This ensures transactional repository swaps are immediately visible to graph consumers.
 */
class StoreBackedGraphAbstractionLayer implements GraphAbstractionLayer {
  private readonly outgoingCache = new RevisionedTtlCache<readonly BaseArchitectureRelationship[]>({
    ttlMs: CACHE_POLICY.graphQuery.ttlMs,
    maxEntries: CACHE_POLICY.graphQuery.maxEntries,
  });

  private readonly incomingCache = new RevisionedTtlCache<readonly BaseArchitectureRelationship[]>({
    ttlMs: CACHE_POLICY.graphQuery.ttlMs,
    maxEntries: CACHE_POLICY.graphQuery.maxEntries,
  });

  private readonly nodeCache = new RevisionedTtlCache<BaseArchitectureElement | null>({
    ttlMs: CACHE_POLICY.graphQuery.ttlMs,
    maxEntries: Math.min(50_000, CACHE_POLICY.graphQuery.maxEntries),
  });

  private readonly nodesByTypeCache = new RevisionedTtlCache<readonly BaseArchitectureElement[]>({
    ttlMs: CACHE_POLICY.graphQuery.ttlMs,
    maxEntries: 1_000,
  });

  private revisionKey(): string {
    return `${getRepositoryRevision()}|${getRelationshipRepositoryRevision()}`;
  }

  async getOutgoingEdges(nodeId: string) {
    const revisionKey = this.revisionKey();
    const key = `out:${String(nodeId ?? '').trim()}`;
    const startedAtMs = telemetry.nowMs();

    const cached = this.outgoingCache.get(key, revisionKey);
    if (cached) {
      telemetry.record({
        name: 'graph.query',
        durationMs: telemetry.nowMs() - startedAtMs,
        tags: { op: 'getOutgoingEdges', cached: true },
        metrics: { resultCount: cached.length },
      });
      return cached;
    }

    const value = await new RepositoryGraphAbstractionLayer({
      elements: getRepository(),
      relationships: getRelationshipRepository(),
    }).getOutgoingEdges(nodeId);

    this.outgoingCache.set(key, revisionKey, value);
    telemetry.record({
      name: 'graph.query',
      durationMs: telemetry.nowMs() - startedAtMs,
      tags: { op: 'getOutgoingEdges', cached: false },
      metrics: { resultCount: value.length },
    });
    return value;
  }

  async getIncomingEdges(nodeId: string) {
    const revisionKey = this.revisionKey();
    const key = `in:${String(nodeId ?? '').trim()}`;
    const startedAtMs = telemetry.nowMs();

    const cached = this.incomingCache.get(key, revisionKey);
    if (cached) {
      telemetry.record({
        name: 'graph.query',
        durationMs: telemetry.nowMs() - startedAtMs,
        tags: { op: 'getIncomingEdges', cached: true },
        metrics: { resultCount: cached.length },
      });
      return cached;
    }

    const value = await new RepositoryGraphAbstractionLayer({
      elements: getRepository(),
      relationships: getRelationshipRepository(),
    }).getIncomingEdges(nodeId);

    this.incomingCache.set(key, revisionKey, value);
    telemetry.record({
      name: 'graph.query',
      durationMs: telemetry.nowMs() - startedAtMs,
      tags: { op: 'getIncomingEdges', cached: false },
      metrics: { resultCount: value.length },
    });
    return value;
  }

  async getNode(nodeId: string) {
    const revisionKey = this.revisionKey();
    const key = `node:${String(nodeId ?? '').trim()}`;
    const startedAtMs = telemetry.nowMs();

    const cached = this.nodeCache.get(key, revisionKey);
    if (cached !== null) {
      telemetry.record({
        name: 'graph.query',
        durationMs: telemetry.nowMs() - startedAtMs,
        tags: { op: 'getNode', cached: true },
        metrics: { resultCount: cached ? 1 : 0 },
      });
      return cached;
    }

    const value = await new RepositoryGraphAbstractionLayer({
      elements: getRepository(),
      relationships: getRelationshipRepository(),
    }).getNode(nodeId);

    this.nodeCache.set(key, revisionKey, value);
    telemetry.record({
      name: 'graph.query',
      durationMs: telemetry.nowMs() - startedAtMs,
      tags: { op: 'getNode', cached: false },
      metrics: { resultCount: value ? 1 : 0 },
    });
    return value;
  }

  async getNodesByType(type: string) {
    const revisionKey = this.revisionKey();
    const key = `type:${String(type ?? '').trim()}`;
    const startedAtMs = telemetry.nowMs();

    const cached = this.nodesByTypeCache.get(key, revisionKey);
    if (cached) {
      telemetry.record({
        name: 'graph.query',
        durationMs: telemetry.nowMs() - startedAtMs,
        tags: { op: 'getNodesByType', cached: true },
        metrics: { resultCount: cached.length },
      });
      return cached;
    }

    const value = await new RepositoryGraphAbstractionLayer({
      elements: getRepository(),
      relationships: getRelationshipRepository(),
    }).getNodesByType(type);

    this.nodesByTypeCache.set(key, revisionKey, value);
    telemetry.record({
      name: 'graph.query',
      durationMs: telemetry.nowMs() - startedAtMs,
      tags: { op: 'getNodesByType', cached: false },
      metrics: { resultCount: value.length },
    });
    return value;
  }
}

let graph: GraphAbstractionLayer | null = null;

export function getGraphAbstractionLayer(): GraphAbstractionLayer {
  if (!graph) graph = new StoreBackedGraphAbstractionLayer();
  return graph;
}

/** Replace the runtime GAL (transactional swap), useful for tests or alternate backends. */
export function setGraphAbstractionLayer(next: GraphAbstractionLayer) {
  graph = next;
}
