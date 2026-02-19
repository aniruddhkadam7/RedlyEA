import type { ArchitectureRepository } from '../repository/ArchitectureRepository';
import type { BaseArchitectureElement } from '../repository/BaseArchitectureElement';
import type { RelationshipRepository } from '../repository/RelationshipRepository';
import type { Technology } from '../repository/Technology';

import type {
  ValidationFinding,
  ValidationSeverity,
} from '../validation/ValidationFinding';

import {
  type ArchitectureHealthMetrics,
  deriveHealthTrend,
  type HealthTrend,
} from './ArchitectureHealthMetrics';

export type ArchitectureHealthWeights = {
  /** Penalty points at a 100% issue rate. */
  errorPenaltyPoints: number;
  warningPenaltyPoints: number;
  orphanPenaltyPoints: number;
  lifecycleRiskPenaltyPoints: number;
  technologyObsolescencePenaltyPoints: number;
};

/**
 * Default scoring weights.
 *
 * Rationale:
 * - Errors represent hard failures and are weighted most heavily.
 * - Technology obsolescence and warnings follow.
 * - Orphans and lifecycle risks are important but usually remediable.
 */
export const DEFAULT_ARCHITECTURE_HEALTH_WEIGHTS: ArchitectureHealthWeights = {
  errorPenaltyPoints: 60,
  warningPenaltyPoints: 25,
  orphanPenaltyPoints: 20,
  lifecycleRiskPenaltyPoints: 20,
  technologyObsolescencePenaltyPoints: 25,
} as const;

export type ArchitectureHealthSnapshot = {
  scopeKey: string;
  observedAt: string;
  metrics: ArchitectureHealthMetrics;
  weightsUsed: ArchitectureHealthWeights;
  stableTrendDelta: number;
  previousOverallHealthScore?: number;
  deltaFromPrevious?: number;
};

export type ArchitectureHealthEngineEvaluateInput = {
  scopeKey?: string;
  elements: ArchitectureRepository;
  relationships: RelationshipRepository;
  findings: readonly ValidationFinding[];
  now?: Date;

  /** Trend stability band. Default: 2. */
  stableTrendDelta?: number;

  /** If provided, overrides default weights. */
  weights?: Partial<ArchitectureHealthWeights>;

  /**
   * Maximum number of in-memory snapshots to retain per scope.
   * Default: 50.
   */
  maxHistory?: number;
};

const normalizeScopeKey = (value: unknown): string => {
  const key = typeof value === 'string' ? value.trim() : '';
  return key || 'default';
};

const toNonNegativeInteger = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
};

const parseDateMs = (iso: string | undefined): number | null => {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
};

const listAllElements = (
  repo: ArchitectureRepository,
): BaseArchitectureElement[] => {
  // Deterministic order by stable collection sequence + stable sort by id.
  const all = [
    ...repo.getElementsByType('capabilities'),
    ...repo.getElementsByType('businessProcesses'),
    ...repo.getElementsByType('applications'),
    ...repo.getElementsByType('technologies'),
    ...repo.getElementsByType('programmes'),
  ];
  all.sort(
    (a, b) =>
      a.id.localeCompare(b.id) || a.elementType.localeCompare(b.elementType),
  );
  return all;
};

const severityRank = (s: ValidationSeverity): number =>
  s === 'Error' ? 3 : s === 'Warning' ? 2 : 1;

/**
 * ArchitectureHealthEngine
 *
 * Responsibilities:
 * - Aggregate ValidationFindings (element-level).
 * - Compute ArchitectureHealthMetrics (including score + trend).
 * - Track trend in-memory only (no persistence).
 *
 * Non-responsibilities:
 * - No storage to disk/DB.
 * - No presentation formatting/normalization.
 */
export class ArchitectureHealthEngine {
  private readonly historyByScope = new Map<
    string,
    ArchitectureHealthSnapshot[]
  >();

  /** Read-only: returns a shallow copy of the history for the scope. */
  getHistory(scopeKey?: string): ArchitectureHealthSnapshot[] {
    const key = normalizeScopeKey(scopeKey);
    const list = this.historyByScope.get(key) ?? [];
    return [...list];
  }

  /** Clears history for a scope (or all scopes if scopeKey omitted). */
  clearHistory(scopeKey?: string): void {
    if (scopeKey === undefined) {
      this.historyByScope.clear();
      return;
    }
    const key = normalizeScopeKey(scopeKey);
    this.historyByScope.delete(key);
  }

  evaluate(
    input: ArchitectureHealthEngineEvaluateInput,
  ): ArchitectureHealthSnapshot {
    const now = input.now ?? new Date();
    const observedAt = now.toISOString();
    const scopeKey = normalizeScopeKey(input.scopeKey);

    const weights: ArchitectureHealthWeights = {
      ...DEFAULT_ARCHITECTURE_HEALTH_WEIGHTS,
      ...(input.weights ?? {}),
    };

    // ---- Total elements ----
    const allElements = listAllElements(input.elements);
    const totalElements = allElements.length;

    // ---- Aggregate findings -> elementsWithErrors / elementsWithWarnings ----
    // Deterministic: we resolve findings to known element ids and compute max severity per element.
    const maxSeverityByElementId = new Map<string, ValidationSeverity>();

    for (const finding of input.findings ?? []) {
      const elementId = (finding.affectedElementId ?? '').trim();
      if (!elementId) continue;

      // Only count findings for elements that exist in the repository.
      const exists = input.elements.getElementById(elementId);
      if (!exists) continue;

      const current = maxSeverityByElementId.get(elementId);
      if (!current) {
        maxSeverityByElementId.set(elementId, finding.severity);
        continue;
      }

      if (severityRank(finding.severity) > severityRank(current)) {
        maxSeverityByElementId.set(elementId, finding.severity);
      }
    }

    let elementsWithErrors = 0;
    let elementsWithWarnings = 0;

    for (const severity of maxSeverityByElementId.values()) {
      if (severity === 'Error') elementsWithErrors += 1;
      else if (severity === 'Warning') elementsWithWarnings += 1;
    }

    // ---- Orphans: elements with zero relationships (incoming+outgoing) ----
    let orphanedElementsCount = 0;
    for (const e of allElements) {
      const relCount = input.relationships.getRelationshipsForElement(
        e.id,
      ).length;
      if (relCount === 0) orphanedElementsCount += 1;
    }

    // ---- Lifecycle risk ----
    // Deterministic rule: count elements with lifecycleStatus Deprecated/Retired OR lifecycleEndDate in the past.
    const nowMs = now.getTime();
    let lifecycleRiskCount = 0;
    for (const e of allElements) {
      const isRiskStatus =
        e.lifecycleStatus === 'Deprecated' || e.lifecycleStatus === 'Retired';
      const endMs = parseDateMs(e.lifecycleEndDate);
      const isPastEndDate = endMs !== null && endMs < nowMs;
      if (isRiskStatus || isPastEndDate) lifecycleRiskCount += 1;
    }

    // ---- Technology obsolescence ----
    // Deterministic rule: for Technology elements, count if supportEndDate is in the past OR obsolescenceRisk is High.
    let technologyObsolescenceCount = 0;
    for (const tech of input.elements.getElementsByType('technologies')) {
      const supportEndMs = parseDateMs((tech as Technology).supportEndDate);
      const isPastSupportEnd = supportEndMs !== null && supportEndMs < nowMs;
      const isHighObsolescenceRisk =
        (tech as Technology).obsolescenceRisk === 'High';

      if (isPastSupportEnd || isHighObsolescenceRisk)
        technologyObsolescenceCount += 1;
    }

    // ---- Score (explicit weights) ----
    // We reuse computeOverallHealthScore's structure but with caller-visible weights.
    // To keep all weighting transparent, we apply weights here, not hidden behind a default.
    const effectiveTotal = Math.max(1, totalElements);

    const errorPenalty =
      weights.errorPenaltyPoints * (elementsWithErrors / effectiveTotal);
    const warningPenalty =
      weights.warningPenaltyPoints * (elementsWithWarnings / effectiveTotal);
    const orphanPenalty =
      weights.orphanPenaltyPoints * (orphanedElementsCount / effectiveTotal);
    const lifecyclePenalty =
      weights.lifecycleRiskPenaltyPoints *
      (lifecycleRiskCount / effectiveTotal);
    const techPenalty =
      weights.technologyObsolescencePenaltyPoints *
      (technologyObsolescenceCount / effectiveTotal);

    const scoreFromWeights = Math.round(
      Math.max(
        0,
        Math.min(
          100,
          100 -
            (errorPenalty +
              warningPenalty +
              orphanPenalty +
              lifecyclePenalty +
              techPenalty),
        ),
      ),
    );

    const history = this.historyByScope.get(scopeKey) ?? [];
    const previous =
      history.length > 0 ? history[history.length - 1] : undefined;
    const previousScore = previous?.metrics.overallHealthScore;

    const stableTrendDelta = input.stableTrendDelta ?? 2;
    const healthTrend: HealthTrend = deriveHealthTrend({
      currentOverallHealthScore: scoreFromWeights,
      previousOverallHealthScore: previousScore,
      stableTrendDelta,
    });

    const metrics: ArchitectureHealthMetrics = {
      totalElements: toNonNegativeInteger(totalElements),
      elementsWithErrors: toNonNegativeInteger(elementsWithErrors),
      elementsWithWarnings: toNonNegativeInteger(elementsWithWarnings),
      orphanedElementsCount: toNonNegativeInteger(orphanedElementsCount),
      lifecycleRiskCount: toNonNegativeInteger(lifecycleRiskCount),
      technologyObsolescenceCount: toNonNegativeInteger(
        technologyObsolescenceCount,
      ),
      overallHealthScore: scoreFromWeights,
      healthTrend,
    };

    const snapshot: ArchitectureHealthSnapshot = {
      scopeKey,
      observedAt,
      metrics,
      weightsUsed: weights,
      stableTrendDelta,
      previousOverallHealthScore: previousScore,
      deltaFromPrevious:
        previousScore === undefined
          ? undefined
          : scoreFromWeights - previousScore,
    };

    const nextHistory = [...history, snapshot];
    const maxHistory = input.maxHistory ?? 50;

    // Trim oldest snapshots deterministically.
    const trimmed =
      maxHistory > 0 && nextHistory.length > maxHistory
        ? nextHistory.slice(-maxHistory)
        : nextHistory;
    this.historyByScope.set(scopeKey, trimmed);

    return snapshot;
  }
}

export const architectureHealthEngine = new ArchitectureHealthEngine();
