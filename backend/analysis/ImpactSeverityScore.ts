export type SeverityLabel = 'Low' | 'Medium' | 'High';

/**
 * Criticality of an element itself (independent of any particular path).
 *
 * Note: kept explicit and string-based for auditability.
 */
export type ElementCriticality = 'Low' | 'Medium' | 'High' | 'Unknown';

/**
 * Transparent scoring contract for impact severity.
 *
 * Principles:
 * - Explicit inputs and outputs (no hidden weights/heuristics in the model).
 * - Computation is performed by a separate scoring service.
 * - No defaults.
 */
export type ImpactSeverityScore = {
  elementId: string;

  // Evidence counts (typically derived from ImpactedElementEvidence)
  totalPaths: number;
  hardPathCount: number;
  softOnlyPathCount: number;

  // Input context
  elementCriticality: ElementCriticality;

  // Scoring output
  /** Inclusive range 0–100 (validation enforced by the scoring engine, not this model). */
  computedScore: number;

  severityLabel: SeverityLabel;
};
