export type AdrStatus = 'Proposed' | 'Accepted' | 'Superseded';

/**
 * Architecture Decision Record (ADR).
 *
 * Principles:
 * - Lightweight: plain fields only, no enforced formatting.
 * - Explicit: status + decisionDate are stored, never inferred.
 * - Long-term memory boundary: this is a stable domain model (storage can evolve).
 */
export type ArchitectureDecisionRecord = {
  adrId: string;
  title: string;
  context: string;
  decision: string;
  consequences: string;

  relatedElements: string[];
  relatedViews: string[];

  status: AdrStatus;
  /** ISO-8601 date (or timestamp). */
  decisionDate: string;
};

export type ArchitectureDecisionRecordUpsertInput = Partial<Omit<ArchitectureDecisionRecord, 'adrId'>> & {
  adrId?: string;
};
