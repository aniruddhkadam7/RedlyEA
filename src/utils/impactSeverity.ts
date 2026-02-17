export type ImpactCriticality = 'high' | 'medium' | 'low';

export type ImpactSeverityLabel = 'High' | 'Medium' | 'Low';

export type ComputeImpactSeverityInput = {
  totalPaths: number;
  hardPathCount: number;
  softOnlyPathCount: number;
  criticality: ImpactCriticality;
};

export type ComputeImpactSeverityResult = {
  severityScore: number; // 0–100
  severityLabel: ImpactSeverityLabel;
};

export function computeImpactSeverity({
  totalPaths,
  hardPathCount,
  softOnlyPathCount,
  criticality,
}: ComputeImpactSeverityInput): ComputeImpactSeverityResult {
  // Defensive normalization (pure; no side effects)
  const hard = Number.isFinite(hardPathCount) ? Math.max(0, hardPathCount) : 0;
  const softOnly = Number.isFinite(softOnlyPathCount) ? Math.max(0, softOnlyPathCount) : 0;
  const total = Number.isFinite(totalPaths) ? Math.max(0, totalPaths) : 0;

  // Path evidence weighting: hard paths carry more impact signal than soft-only paths.
  const hardWeight = 1.0;
  const softWeight = 0.4;

  // If totalPaths is inconsistent with hard/soft counts, we still score from the counts.
  // (total is retained as an input but not trusted as the source of truth).
  const effectivePathEvidence = hard * hardWeight + softOnly * softWeight;

  const criticalityMultiplier = criticality === 'high' ? 3 : criticality === 'medium' ? 2 : 1;

  // Diminishing returns + normalization to 0..100:
  // score = 100 * (1 - e^(-k * evidence * multiplier))
  // k controls how quickly the score approaches 100.
  const k = 0.6;
  const raw = effectivePathEvidence * criticalityMultiplier;

  // If there are explicitly zero total paths, treat as zero impact regardless of evidence.
  const normalized = total === 0 ? 0 : 1 - Math.exp(-k * raw);

  const severityScore = Math.max(0, Math.min(100, Math.round(100 * normalized)));

  const severityLabel: ImpactSeverityLabel =
    severityScore >= 70 ? 'High' : severityScore >= 40 ? 'Medium' : 'Low';

  return { severityScore, severityLabel };
}
