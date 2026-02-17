import type { GraphAbstractionLayer } from './GraphAbstractionLayer';
import type { ArchitectureRepository } from '../repository/ArchitectureRepository';
import type { BaseArchitectureElement } from '../repository/BaseArchitectureElement';
import type { BaseArchitectureRelationship } from '../repository/BaseArchitectureRelationship';
import type { RelationshipRepository } from '../repository/RelationshipRepository';

const normalizeId = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const normalizeType = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const compareStrings = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const relationshipSortKey = (r: BaseArchitectureRelationship) =>
  `${normalizeType(r.relationshipType)}|${normalizeId(r.sourceElementId)}|${normalizeId(r.targetElementId)}|${normalizeId(r.id)}`;

const elementSortKey = (e: BaseArchitectureElement) =>
  `${normalizeType(e.elementType)}|${normalizeType(e.name)}|${normalizeId(e.id)}`;

/**
 * InMemoryGraphAdapter
 *
 * Reference GraphAbstractionLayer implementation over the current in-memory repositories.
 *
 * Design goals:
 * - Correctness + determinism first.
 * - Intentionally simple (no caching, no additional indexing).
 * - Suitable for tests and small projects.
 */
export class InMemoryGraphAdapter implements GraphAbstractionLayer {
  private readonly elements: ArchitectureRepository;
  private readonly relationships: RelationshipRepository;

  constructor(args: { elements: ArchitectureRepository; relationships: RelationshipRepository }) {
    this.elements = args.elements;
    this.relationships = args.relationships;
  }

  async getOutgoingEdges(nodeId: string): Promise<readonly BaseArchitectureRelationship[]> {
    const id = normalizeId(nodeId);
    if (!id) return [];

    return this.relationships
      .getAllRelationships()
      .filter((r) => normalizeId(r.sourceElementId) === id)
      .slice()
      .sort((a, b) => compareStrings(relationshipSortKey(a), relationshipSortKey(b)));
  }

  async getIncomingEdges(nodeId: string): Promise<readonly BaseArchitectureRelationship[]> {
    const id = normalizeId(nodeId);
    if (!id) return [];

    return this.relationships
      .getAllRelationships()
      .filter((r) => normalizeId(r.targetElementId) === id)
      .slice()
      .sort((a, b) => compareStrings(relationshipSortKey(a), relationshipSortKey(b)));
  }

  async getNode(nodeId: string): Promise<BaseArchitectureElement | null> {
    const id = normalizeId(nodeId);
    if (!id) return null;
    return this.elements.getElementById(id);
  }

  async getNodesByType(type: string): Promise<readonly BaseArchitectureElement[]> {
    const t = normalizeType(type);
    if (!t) return [];

    const all: BaseArchitectureElement[] = [
      ...this.elements.getElementsByType('capabilities'),
      ...this.elements.getElementsByType('businessProcesses'),
      ...this.elements.getElementsByType('applications'),
      ...this.elements.getElementsByType('technologies'),
      ...this.elements.getElementsByType('programmes'),
    ];

    return all
      .filter((e) => normalizeType(e.elementType) === t)
      .slice()
      .sort((a, b) => compareStrings(elementSortKey(a), elementSortKey(b)));
  }
}
