export type ImportExportOperation = 'IMPORT' | 'EXPORT';

export type ImportExportOutcome = 'SUCCESS' | 'FAILURE';

export type ImportExportActor = {
  /** Stable identifier when available (e.g. userId). */
  actorId: string;

  /** Human-friendly display name when available (e.g. username). */
  displayName?: string;

  /** Optional coarse access role (admin/user/guest). */
  access?: string;
};

export type ImportAuditScope = {
  /** The import source type (currently only CSV is implemented). */
  sourceType: 'CSV' | 'ArchiMate' | 'ToolSpecific';

  /** The strict CSV entity schema being imported. */
  csvEntity?: string;

  /** Optional human label (e.g. filename). */
  sourceDescription?: string;

  /** Approximate payload size (bytes) if known. */
  payloadBytes?: number;
};

export type ExportAuditScope = {
  /** Export type intent (Repository/View/Analysis/FullProject). */
  exportType: string;

  includedElementTypes: readonly string[];
  includedRelationshipTypes: readonly string[];

  includeViews: boolean;
  includeGovernanceArtifacts: boolean;

  /** Output format (currently CSV only). */
  format: 'CSV';
};

export type ImportExportErrorDigest = {
  code?: string;
  message: string;
  line?: number;
  column?: string;
};

export type ImportExportResultSummary = {
  outcome: ImportExportOutcome;

  /** Counts are safe for audit logs (no data content stored). */
  importedElementsCount?: number;
  importedRelationshipsCount?: number;
  exportedElementsCount?: number;
  exportedRelationshipsCount?: number;

  warningCount?: number;
  errorCount?: number;

  /** Small, bounded digest for traceability (never full datasets). */
  errorDigest?: ImportExportErrorDigest[];
};

export type ImportExportAuditRecord = {
  auditId: string;

  operation: ImportExportOperation;
  actor: ImportExportActor;

  /** ISO timestamps. */
  startedAt: string;
  completedAt: string;

  /** Milliseconds observed, for operational traceability. */
  durationMs: number;

  /** Scope of the operation (what was imported/exported). */
  scope: ImportAuditScope | ExportAuditScope;

  /** Result summary (counts + small digests only). */
  result: ImportExportResultSummary;

  /** Optional external correlation id. */
  requestId?: string;
};
