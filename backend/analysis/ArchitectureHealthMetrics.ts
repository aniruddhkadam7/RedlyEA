export type HealthTrend = 'Stable' | 'Improving' | 'Degrading';

/**
 * ArchitectureHealthMetrics (executive-level domain model).
 *
 * This is intentionally measurable and deterministic:
 * - All inputs are explicit counts (no hidden data sources).
 * - Derived fields are computed via exported pure functions.
 * - No enforcement, no mutation, no ML.
 */
export type ArchitectureHealthMetrics = {
  // Raw metrics
  totalElements: number;
  elementsWithErrors: number;
  elementsWithWarnings: number;
  orphanedElementsCount: number;
  lifecycleRiskCount: number;
  technologyObsolescenceCount: number;

  // Derived metrics
  overallHealthScore: number; // 0–100
  healthTrend: HealthTrend;
};

export type ArchitectureHealthMetricsInput = Omit<
  ArchitectureHealthMetrics,
  'overallHealthScore' | 'healthTrend'
> & {
  /** Optional prior score for trend derivation. */
  previousOverallHealthScore?: number;

  /**
   * Score delta within this band is considered Stable.
   * Default: 2 (small fluctuations do not imply a trend).
   */
  stableTrendDelta?: number;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const toNonNegativeInteger = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
};

/**
 * Ensures metric counts are non-negative integers.
 *
 * Note: this is input sanitation (for deterministic computation), not presentation normalization.
 */
export function normalizeArchitectureHealthMetricCounts(input: {
  totalElements: number;
  elementsWithErrors: number;
  elementsWithWarnings: number;
  orphanedElementsCount: number;
  lifecycleRiskCount: number;
  technologyObsolescenceCount: number;
}): Omit<ArchitectureHealthMetrics, 'overallHealthScore' | 'healthTrend'> {
  const totalElements = toNonNegativeInteger(input.totalElements);

  return {
    totalElements,
    elementsWithErrors: toNonNegativeInteger(input.elementsWithErrors),
    elementsWithWarnings: toNonNegativeInteger(input.elementsWithWarnings),
    orphanedElementsCount: toNonNegativeInteger(input.orphanedElementsCount),
    lifecycleRiskCount: toNonNegativeInteger(input.lifecycleRiskCount),
    technologyObsolescenceCount: toNonNegativeInteger(
      input.technologyObsolescenceCount,
    ),
  };
}

/**
 * Computes an overall health score in the range 0..100.
 *
 * Scoring model (explicit):
 * - Start at 100.
 * - Subtract weighted penalties based on issue rates.
 * - Clamp to [0, 100] and round to an integer.
 *
 * Weights reflect executive impact: errors are most costly, followed by tech obsolescence and warnings.
 */
export function computeOverallHealthScore(input: {
  totalElements: number;
  elementsWithErrors: number;
  elementsWithWarnings: number;
  orphanedElementsCount: number;
  lifecycleRiskCount: number;
  technologyObsolescenceCount: number;
}): number {
  const normalized = normalizeArchitectureHealthMetricCounts(input);
  const total = Math.max(1, normalized.totalElements);

  const errorRate = normalized.elementsWithErrors / total;
  const warningRate = normalized.elementsWithWarnings / total;
  const orphanRate = normalized.orphanedElementsCount / total;
  const lifecycleRiskRate = normalized.lifecycleRiskCount / total;
  const techObsoleteRate = normalized.technologyObsolescenceCount / total;

  // Explicit weights (penalty points at a 100% rate).
  // Rates are not capped: if counts exceed total, penalty increases proportionally.
  const errorPenalty = 60 * errorRate;
  const warningPenalty = 25 * warningRate;
  const orphanPenalty = 20 * orphanRate;
  const lifecyclePenalty = 20 * lifecycleRiskRate;
  const techPenalty = 25 * techObsoleteRate;

  const score =
    100 -
    (errorPenalty +
      warningPenalty +
      orphanPenalty +
      lifecyclePenalty +
      techPenalty);
  return Math.round(clamp(score, 0, 100));
}

/**
 * Derives a trend label from a prior score.
 */
export function deriveHealthTrend(args: {
  currentOverallHealthScore: number;
  previousOverallHealthScore?: number;
  stableTrendDelta?: number;
}): HealthTrend {
  const stableDelta = toNonNegativeInteger(args.stableTrendDelta ?? 2);
  const current = clamp(
    toNonNegativeInteger(args.currentOverallHealthScore),
    0,
    100,
  );

  if (
    args.previousOverallHealthScore === undefined ||
    args.previousOverallHealthScore === null
  )
    return 'Stable';

  const previous = clamp(
    toNonNegativeInteger(args.previousOverallHealthScore),
    0,
    100,
  );
  const delta = current - previous;

  if (delta >= stableDelta) return 'Improving';
  if (delta <= -stableDelta) return 'Degrading';
  return 'Stable';
}

/**
 * Convenience helper that computes all derived fields.
 */
export function deriveArchitectureHealthMetrics(
  input: ArchitectureHealthMetricsInput,
): ArchitectureHealthMetrics {
  const normalized = normalizeArchitectureHealthMetricCounts(input);
  const overallHealthScore = computeOverallHealthScore(normalized);
  const healthTrend = deriveHealthTrend({
    currentOverallHealthScore: overallHealthScore,
    previousOverallHealthScore: input.previousOverallHealthScore,
    stableTrendDelta: input.stableTrendDelta,
  });

  return {
    ...normalized,
    overallHealthScore,
    healthTrend,
  };
}
