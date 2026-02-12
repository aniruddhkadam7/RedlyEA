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

/**
 * Adapter over the current in-memory repositories.
 *
 * Notes:
 * - Still storage-agnostic at the call-site: callers depend only on GraphAbstractionLayer.
 * - Enforces deterministic ordering of results.
 */
export class RepositoryGraphAbstractionLayer implements GraphAbstractionLayer {
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
      .getOutgoingRelationships(id)
      .slice()
      .sort((a, b) => compareStrings(relationshipSortKey(a), relationshipSortKey(b)));
  }

  async getIncomingEdges(nodeId: string): Promise<readonly BaseArchitectureRelationship[]> {
    const id = normalizeId(nodeId);
    if (!id) return [];
    // RelationshipRepository indexes by element id already (both endpoints), so this is bounded by degree.
    return this.relationships
      .getRelationshipsForElement(id)
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

    // The underlying repository is partitioned by collections, not by arbitrary elementType.
    // We enumerate known collections and filter by elementType.
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
      .sort((a, b) =>
        compareStrings(normalizeType(a.elementType), normalizeType(b.elementType)) ||
        compareStrings(normalizeType(a.name), normalizeType(b.name)) ||
        compareStrings(normalizeId(a.id), normalizeId(b.id)),
      );
  }
}
