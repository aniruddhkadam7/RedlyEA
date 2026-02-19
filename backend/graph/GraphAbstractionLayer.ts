import type { BaseArchitectureElement } from '../repository/BaseArchitectureElement';
import type { BaseArchitectureRelationship } from '../repository/BaseArchitectureRelationship';

/**
 * GraphAbstractionLayer (GAL)
 *
 * Purpose:
 * - Decouple graph traversal / analysis / traceability logic from any specific storage engine.
 *
 * Rules:
 * - No business logic.
 * - No persistence assumptions.
 *
 * Determinism contract:
 * - All returned arrays MUST be in deterministic order for a given graph snapshot.
 *   (Implementations should sort by stable keys such as relationshipType/source/target/id and elementType/name/id.)
 */
export interface GraphAbstractionLayer {
  /** Outgoing (source → target) edges for a node id. */
  getOutgoingEdges(
    nodeId: string,
  ): Promise<readonly BaseArchitectureRelationship[]>;

  /** Incoming (source → target) edges where nodeId is the target. */
  getIncomingEdges(
    nodeId: string,
  ): Promise<readonly BaseArchitectureRelationship[]>;

  /** Returns the node (element) by id, or null if unknown. */
  getNode(nodeId: string): Promise<BaseArchitectureElement | null>;

  /** Returns all nodes (elements) whose elementType matches `type` (trimmed string match). */
  getNodesByType(type: string): Promise<readonly BaseArchitectureElement[]>;
}
