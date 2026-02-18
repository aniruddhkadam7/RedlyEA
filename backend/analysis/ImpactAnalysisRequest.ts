export type ImpactAnalysisDirection =
  | 'Downstream'
  | 'Upstream'
  | 'Bidirectional';

export type ImpactAnalysisIntent =
  | 'Change'
  | 'Risk'
  | 'Failure'
  | 'Decommission';

/**
 * Explicit, auditable request to perform an impact analysis.
 *
 * Notes:
 * - This is a pure domain model (no computation, no defaults).
 * - All timestamps are ISO-8601 strings.
 * - `requestId` is expected to be a UUID.
 */
export type ImpactAnalysisRequest = {
  // Context
  readonly requestId: string;
  projectId: string;
  requestedBy: string;
  requestedAt: string;

  /**
   * Immutable repository identifier (EA workspace identity).
   *
   * Notes:
   * - Optional for backwards compatibility.
   * - When present, it is treated as read-only and recorded into audit logs.
   */
  repositoryName?: string;

  // Analysis scope
  rootElementId: string;
  rootElementType: string;
  direction: ImpactAnalysisDirection;
  maxDepth: number;

  // Filters
  includedElementTypes: readonly string[];
  includedRelationshipTypes: readonly string[];

  // Purpose
  analysisIntent: ImpactAnalysisIntent;
};
