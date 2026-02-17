import type { ImpactAnalysisDirection, ImpactAnalysisIntent } from './ImpactAnalysisRequest';

export type ImpactAnalysisParameters = {
  rootElementId: string;
  rootElementType: string;

  direction: ImpactAnalysisDirection;
  maxDepth: number;

  includedRelationshipTypes: readonly string[];

  analysisIntent: ImpactAnalysisIntent;

  /** Whether raw paths were requested to be included in the response. */
  includePaths: boolean;
};

/**
 * Passive audit metadata for an impact analysis run.
 *
 * Principles:
 * - No persistence (in-memory only, process lifetime).
 * - No full results stored.
 * - Non-blocking: audit failures must never block analysis.
 */
export type ImpactAnalysisAuditRecord = {
  /** Unique within the current running process. */
  auditId: string;

  /** Correlates back to the request contract. */
  requestId: string;

  /** Immutable repository identifier (EA workspace identity) if provided. */
  repositoryName?: string;

  // Accountability
  ranBy: string;
  ranAt: string; // ISO-8601 timestamp

  // Parameters (explicit)
  parameters: ImpactAnalysisParameters;
};
