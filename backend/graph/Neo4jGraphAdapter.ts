import type { Driver, Session } from 'neo4j-driver';
import neo4j from 'neo4j-driver';

import type { GraphAbstractionLayer } from './GraphAbstractionLayer';
import type { BaseArchitectureElement } from '../repository/BaseArchitectureElement';
import type { BaseArchitectureRelationship } from '../repository/BaseArchitectureRelationship';
import { DomainError } from '../reliability/DomainError';

export type Neo4jGraphAdapterConfig = {
  /** neo4j-driver instance (owned/closed by the caller). */
  driver: Driver;

  /** Optional database name (Neo4j Enterprise multi-db). */
  database?: string;

  /** Label used for architecture elements. Default: EAElement */
  nodeLabel?: string;

  /** Relationship type used for EA edges. Default: EA_REL */
  edgeRelType?: string;
};

const normalizeId = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const normalizeType = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const toNative = (value: unknown): any => {
  if (neo4j.isInt(value)) {
    // Prefer number when safe; otherwise return string to preserve determinism.
    return (value as any).inSafeRange() ? (value as any).toNumber() : (value as any).toString();
  }

  if (Array.isArray(value)) return value.map((v) => toNative(v));

  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = toNative(v);
    return out;
  }

  return value;
};

const relationshipSortOrder = `ORDER BY relType ASC, sourceId ASC, targetId ASC, relId ASC`;

const toBackendUnavailableError = (operation: string, err: unknown): DomainError => {
  const neo4jCode = (err as any)?.code;
  const message = err instanceof Error ? err.message : String(err);
  return new DomainError({
    code: 'GRAPH_BACKEND_UNAVAILABLE',
    message: `Neo4j backend unavailable during ${operation}: ${message}`,
    retryable: true,
    details: { operation, neo4jCode },
    cause: err,
  });
};

/**
 * Neo4jGraphAdapter
 *
 * Read-only enterprise backend implementation of GraphAbstractionLayer.
 *
 * Notes:
 * - Cypher is contained here (not in business logic).
 * - Deterministic ordering is enforced via ORDER BY.
 * - No APOC.
 * - No writes.
 */
export class Neo4jGraphAdapter implements GraphAbstractionLayer {
  private readonly driver: Driver;
  private readonly database?: string;
  private readonly nodeLabel: string;
  private readonly edgeRelType: string;

  constructor(config: Neo4jGraphAdapterConfig) {
    this.driver = config.driver;
    this.database = config.database;
    this.nodeLabel = normalizeType(config.nodeLabel) || 'EAElement';
    this.edgeRelType = normalizeType(config.edgeRelType) || 'EA_REL';
  }

  private session(): Session {
    return this.driver.session({ database: this.database, defaultAccessMode: neo4j.session.READ });
  }

  async getOutgoingEdges(nodeId: string): Promise<readonly BaseArchitectureRelationship[]> {
    const id = normalizeId(nodeId);
    if (!id) return [];

    const session = this.session();
    try {
      const cypher = `
        MATCH (s:${this.nodeLabel} {id: $id})-[r:${this.edgeRelType}]->(t:${this.nodeLabel})
        WITH s, t, r,
          coalesce(r.relationshipType, type(r)) AS relType,
          coalesce(r.id, '') AS relId,
          s.id AS sourceId,
          s.elementType AS sourceType,
          t.id AS targetId,
          t.elementType AS targetType
        ${relationshipSortOrder}
        RETURN r, relType, relId, sourceId, sourceType, targetId, targetType
      `.trim();

      const result = await session.executeRead((tx) => tx.run(cypher, { id }));

      return result.records.map((rec) => {
        const rel = rec.get('r') as any;
        const props = toNative(rel?.properties ?? {}) as Record<string, unknown>;

        const relationshipType = normalizeType(rec.get('relType'));
        const relationshipId = normalizeId(rec.get('relId')) || normalizeId(props.id);

        return {
          ...props,
          id: relationshipId,
          relationshipType,
          direction: 'OUTGOING',
          sourceElementId: normalizeId(rec.get('sourceId')),
          sourceElementType: normalizeType(rec.get('sourceType')),
          targetElementId: normalizeId(rec.get('targetId')),
          targetElementType: normalizeType(rec.get('targetType')),
        } as BaseArchitectureRelationship;
      });
    } catch (err) {
      throw toBackendUnavailableError('getOutgoingEdges', err);
    } finally {
      await session.close();
    }
  }

  async getIncomingEdges(nodeId: string): Promise<readonly BaseArchitectureRelationship[]> {
    const id = normalizeId(nodeId);
    if (!id) return [];

    const session = this.session();
    try {
      const cypher = `
        MATCH (s:${this.nodeLabel})-[r:${this.edgeRelType}]->(t:${this.nodeLabel} {id: $id})
        WITH s, t, r,
          coalesce(r.relationshipType, type(r)) AS relType,
          coalesce(r.id, '') AS relId,
          s.id AS sourceId,
          s.elementType AS sourceType,
          t.id AS targetId,
          t.elementType AS targetType
        ${relationshipSortOrder}
        RETURN r, relType, relId, sourceId, sourceType, targetId, targetType
      `.trim();

      const result = await session.executeRead((tx) => tx.run(cypher, { id }));

      return result.records.map((rec) => {
        const rel = rec.get('r') as any;
        const props = toNative(rel?.properties ?? {}) as Record<string, unknown>;

        const relationshipType = normalizeType(rec.get('relType'));
        const relationshipId = normalizeId(rec.get('relId')) || normalizeId(props.id);

        return {
          ...props,
          id: relationshipId,
          relationshipType,
          direction: 'OUTGOING',
          sourceElementId: normalizeId(rec.get('sourceId')),
          sourceElementType: normalizeType(rec.get('sourceType')),
          targetElementId: normalizeId(rec.get('targetId')),
          targetElementType: normalizeType(rec.get('targetType')),
        } as BaseArchitectureRelationship;
      });
    } catch (err) {
      throw toBackendUnavailableError('getIncomingEdges', err);
    } finally {
      await session.close();
    }
  }

  async getNode(nodeId: string): Promise<BaseArchitectureElement | null> {
    const id = normalizeId(nodeId);
    if (!id) return null;

    const session = this.session();
    try {
      const cypher = `
        MATCH (n:${this.nodeLabel} {id: $id})
        RETURN n
        LIMIT 1
      `.trim();

      const result = await session.executeRead((tx) => tx.run(cypher, { id }));
      const rec = result.records[0];
      if (!rec) return null;

      const node = rec.get('n') as any;
      const props = toNative(node?.properties ?? {}) as Record<string, unknown>;
      // We assume stored properties align to BaseArchitectureElement.
      return props as BaseArchitectureElement;
    } catch (err) {
      throw toBackendUnavailableError('getNode', err);
    } finally {
      await session.close();
    }
  }

  async getNodesByType(type: string): Promise<readonly BaseArchitectureElement[]> {
    const t = normalizeType(type);
    if (!t) return [];

    const session = this.session();
    try {
      const cypher = `
        MATCH (n:${this.nodeLabel} {elementType: $type})
        RETURN n
        ORDER BY coalesce(n.name, '') ASC, n.id ASC
      `.trim();

      const result = await session.executeRead((tx) => tx.run(cypher, { type: t }));
      return result.records
        .map((rec) => {
          const node = rec.get('n') as any;
          const props = toNative(node?.properties ?? {}) as Record<string, unknown>;
          return props as BaseArchitectureElement;
        })
        .filter((e) => normalizeId((e as any).id).length > 0);
    } catch (err) {
      throw toBackendUnavailableError('getNodesByType', err);
    } finally {
      await session.close();
    }
  }
}
