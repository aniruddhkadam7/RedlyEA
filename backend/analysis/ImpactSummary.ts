import type { SeverityLabel } from './ImpactSeverityScore';

export type SeverityBreakdown = Record<SeverityLabel, number>;

/**
 * Executive-level snapshot of an impact analysis result.
 *
 * Principles:
 * - Summary-only: does not include individual elements or paths.
 * - Deterministic/auditable: timestamp is explicit.
 */
export type ImpactSummary = {
  rootElementId: string;

  totalImpactedElements: number;

  /** Counts by severity label (High/Medium/Low). */
  severityBreakdown: SeverityBreakdown;

  /** Maximum hop-depth observed across all enumerated paths. */
  maxDependencyDepthObserved: number;

  /** ISO-8601 timestamp of when the summary was produced. */
  analysisTimestamp: string;
};
