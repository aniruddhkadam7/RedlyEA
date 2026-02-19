import type { ImpactedElementEvidence } from './ImpactedElementDeriver';
import type { ImpactSeverityScore } from './ImpactSeverityScore';

export type ImpactRankedElement = {
  elementId: string;
  evidence: ImpactedElementEvidence;
  score?: ImpactSeverityScore;
};

const normalizeId = (value: string) => (value ?? '').trim();

/**
 * Decision-support ranking.
 *
 * Responsibilities:
 * - Exclude the root element.
 * - Sort by: (1) severity score desc, (2) maxDepthObserved desc, (3) totalPaths desc.
 * - Preserve stable ordering on ties.
 *
 * Non-responsibilities:
 * - No score computation or modification.
 * - No evidence removal.
 */
export class ImpactRanking {
  rank(params: {
    rootElementId: string;
    evidenceByElement: readonly ImpactedElementEvidence[];
    scoresByElement: readonly ImpactSeverityScore[];
  }): ImpactRankedElement[] {
    const rootId = normalizeId(params.rootElementId);

    const scoreByElementId = new Map<string, ImpactSeverityScore>();
    for (const s of params.scoresByElement ?? []) {
      const id = normalizeId(s.elementId);
      if (!id) continue;
      // If duplicates exist, preserve first occurrence (stable input contract).
      if (!scoreByElementId.has(id)) scoreByElementId.set(id, s);
    }

    const decorated = (params.evidenceByElement ?? [])
      .filter(
        (e) => normalizeId(e.elementId) && normalizeId(e.elementId) !== rootId,
      )
      .map((e, originalIndex) => {
        const elementId = normalizeId(e.elementId);
        const score = scoreByElementId.get(elementId);
        const computedScore = score?.computedScore ?? 0;

        return {
          elementId,
          evidence: e,
          score,
          // sort keys
          _computedScore: computedScore,
          _maxDepthObserved: e.maxDepthObserved,
          _totalPaths: e.totalPathsAffectingElement,
          _originalIndex: originalIndex,
        };
      });

    decorated.sort((a, b) => {
      if (a._computedScore !== b._computedScore)
        return b._computedScore - a._computedScore;
      if (a._maxDepthObserved !== b._maxDepthObserved)
        return b._maxDepthObserved - a._maxDepthObserved;
      if (a._totalPaths !== b._totalPaths) return b._totalPaths - a._totalPaths;
      return a._originalIndex - b._originalIndex;
    });

    return decorated.map(({ elementId, evidence, score }) => ({
      elementId,
      evidence,
      score,
    }));
  }
}

export const impactRanking = new ImpactRanking();
