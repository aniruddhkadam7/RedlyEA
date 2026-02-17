import type { ElementCriticality, ImpactSeverityScore, SeverityLabel } from './ImpactSeverityScore';

export type ImpactSeverityScoringInput = {
  elementId: string;
  totalPaths: number;
  hardPathCount: number;
  softOnlyPathCount: number;
  elementCriticality: ElementCriticality;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const toNonNegativeInt = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
};

const criticalityMultiplier = (criticality: ElementCriticality): number => {
  // Explicit, auditable multipliers.
  switch (criticality) {
    case 'High':
      return 1.2;
    case 'Medium':
      return 1.0;
    case 'Low':
      return 0.85;
    case 'Unknown':
    default:
      return 1.0;
  }
};

const labelForScore = (score0to100: number): SeverityLabel => {
  // Explicit thresholds; keep these stable for auditability.
  if (score0to100 >= 70) return 'High';
  if (score0to100 >= 35) return 'Medium';
  return 'Low';
};

/**
 * Deterministic, explainable severity scoring engine.
 *
 * Scoring model (transparent):
 * 1) Convert path evidence into "impact units" where Hard > Soft.
 *    - hardWeight = 3
 *    - softWeight = 1
 *    - unknownWeight = 0.5 (paths not accounted for by hard/soft-only)
 *
 * 2) Apply diminishing returns with a saturating curve:
 *    saturation(units) = 1 - exp(-k * units)
 *    where k = 0.2
 *
 * 3) Convert to base score: base = 100 * saturation
 *
 * 4) Apply element criticality as a multiplier (clamped to 0–100):
 *    score = clamp(base * criticalityMultiplier, 0, 100)
 *
 * Output:
 * - `computedScore` is an integer 0–100.
 * - `severityLabel` is derived from explicit thresholds.
 *
 * Non-responsibilities:
 * - No ML / probabilistic inference.
 * - No hidden weights.
 * - No ranking/aggregation beyond producing the score for one element.
 */
export class ImpactSeverityScorer {
  // Keep constants as fields for transparency and easier audit.
  private readonly hardWeight = 3;
  private readonly softWeight = 1;
  private readonly unknownWeight = 0.5;
  private readonly saturationK = 0.2;

  score(input: ImpactSeverityScoringInput): ImpactSeverityScore {
    const totalPaths = toNonNegativeInt(input.totalPaths);
    const hardPathCount = toNonNegativeInt(input.hardPathCount);
    const softOnlyPathCount = toNonNegativeInt(input.softOnlyPathCount);

    const normalizedHard = clamp(hardPathCount, 0, totalPaths);
    const normalizedSoftOnly = clamp(softOnlyPathCount, 0, totalPaths - normalizedHard);
    const unknownCount = clamp(totalPaths - normalizedHard - normalizedSoftOnly, 0, totalPaths);

    const impactUnits =
      normalizedHard * this.hardWeight +
      normalizedSoftOnly * this.softWeight +
      unknownCount * this.unknownWeight;

    const saturation = 1 - Math.exp(-this.saturationK * impactUnits);
    const baseScore = 100 * saturation;

    const multiplier = criticalityMultiplier(input.elementCriticality);
    const finalScore = clamp(baseScore * multiplier, 0, 100);

    const computedScore = Math.round(finalScore);

    return {
      elementId: input.elementId,
      totalPaths,
      hardPathCount: normalizedHard,
      softOnlyPathCount: normalizedSoftOnly,
      elementCriticality: input.elementCriticality,
      computedScore,
      severityLabel: labelForScore(computedScore),
    };
  }

  scoreMany(inputs: readonly ImpactSeverityScoringInput[]): ImpactSeverityScore[] {
    // Deterministic: preserve input order, but callers can sort if desired.
    return (inputs ?? []).map((i) => this.score(i));
  }
}

export const impactSeverityScorer = new ImpactSeverityScorer();
