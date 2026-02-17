/**
 * ImportJob (domain model).
 *
 * Purpose:
 * - Auditable record of an import operation (no execution, no persistence).
 *
 * Notes:
 * - All date/time fields are ISO-8601 strings.
 */

export type ImportSourceType = 'CSV' | 'ArchiMate' | 'ToolSpecific';

export type ImportJobIssueSeverity = 'Warning' | 'Error';

/**
 * Optional issue detail to support auditability.
 *
 * The canonical counts on the job remain the primary contract.
 */
export type ImportJobIssue = {
  severity: ImportJobIssueSeverity;
  message: string;
  /** Optional stable identifier for grouping/deduping (e.g., "UNSUPPORTED_FIELD"). */
  code?: string;
  /** Optional source pointer (e.g., "row:12,col:owner" or "$.nodes[3].type"). */
  sourceRef?: string;
};

export type ImportJob = {
  importJobId: string;

  sourceType: ImportSourceType;
  sourceDescription: string;

  /** ISO-8601 timestamp */
  startedAt: string;
  /** ISO-8601 timestamp (optional until finished) */
  completedAt?: string;

  initiatedBy: string;

  // Results (counts)
  importedElementsCount: number;
  importedRelationshipsCount: number;
  warningsCount: number;
  errorsCount: number;

  /** Optional issue details for auditability (never required for v1). */
  issues?: ImportJobIssue[];
};
