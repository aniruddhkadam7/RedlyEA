export type ArchitectureReviewState =
  | 'Not Reviewed'
  | 'Reviewed'
  | 'Review Findings Accepted';

export type ReviewSubjectKind = 'View' | 'ImpactAnalysis';

/**
 * Lightweight Architecture Review record.
 *
 * Principles:
 * - Non-blocking: never gates execution or editing.
 * - Explicit: state + reviewer + date + notes.
 * - In-memory only (project runtime scope).
 */
export type ArchitectureReviewRecord = {
  subjectKind: ReviewSubjectKind;
  subjectId: string;

  state: ArchitectureReviewState;

  reviewer: string;
  /** ISO-8601 timestamp */
  reviewDate: string;
  reviewNotes: string;
};

export type ArchitectureReviewUpsertInput = {
  state: ArchitectureReviewState;
  reviewer?: string;
  reviewNotes?: string;
  /** Optional: if omitted for non-Not Reviewed states, the server/store may set now. */
  reviewDate?: string;
};
