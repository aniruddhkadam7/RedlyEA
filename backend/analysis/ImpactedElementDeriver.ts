import type { ImpactPath } from './ImpactPath';

export type ImpactedElementEvidence = {
  elementId: string;

  /** Number of distinct paths that include this element (excluding the root). */
  totalPathsAffectingElement: number;

  /** Number of those paths that include at least one Hard dependency. */
  hardPathCount: number;

  /** Number of those paths whose weakest dependency is Soft (and no Hard exists). */
  softOnlyPathCount: number;

  /** Maximum hop-distance from root at which this element is observed. */
  maxDepthObserved: number;
};

const normalizeId = (value: string) => (value ?? '').trim();
const compareStrings = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Derives raw, per-element impact evidence from enumerated paths.
 *
 * Responsibilities:
 * - Set logic only: compute counters per element from provided paths.
 * - Exclude root element(s).
 *
 * Non-responsibilities:
 * - No ranking/scoring/severity labels.
 * - No repository lookups (element types/names live elsewhere).
 */
export class ImpactedElementDeriver {
  derive(paths: readonly ImpactPath[]): ImpactedElementEvidence[] {
    const byElementId = new Map<string, ImpactedElementEvidence>();

    for (const path of paths ?? []) {
      const ordered = path.orderedElementIds ?? [];
      if (ordered.length < 2) continue;

      // Root is always index 0 for this path.
      for (let index = 1; index < ordered.length; index += 1) {
        const elementId = normalizeId(ordered[index] ?? '');
        if (!elementId) continue;

        let evidence = byElementId.get(elementId);
        if (!evidence) {
          evidence = {
            elementId,
            totalPathsAffectingElement: 0,
            hardPathCount: 0,
            softOnlyPathCount: 0,
            maxDepthObserved: 0,
          };
          byElementId.set(elementId, evidence);
        }

        evidence.totalPathsAffectingElement += 1;

        if (path.containsHardDependency) {
          evidence.hardPathCount += 1;
        } else if (path.weakestDependencyStrength === 'Soft') {
          evidence.softOnlyPathCount += 1;
        }

        if (index > evidence.maxDepthObserved)
          evidence.maxDepthObserved = index;
      }
    }

    return Array.from(byElementId.values()).sort((a, b) =>
      compareStrings(a.elementId, b.elementId),
    );
  }
}

export const impactedElementDeriver = new ImpactedElementDeriver();
