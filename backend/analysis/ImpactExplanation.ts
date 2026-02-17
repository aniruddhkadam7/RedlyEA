import type { ImpactPath } from './ImpactPath';
import { getRepository } from '../repository/RepositoryStore';
import type { BaseArchitectureElement } from '../repository/BaseArchitectureElement';

export type ImpactExplanationNode = {
  elementId: string;
  elementType?: string;
  name: string;
};

export type ImpactExplanationResult =
  | {
      ok: true;
      rootElementId: string;
      impactedElementId: string;
      representativePath: ImpactPath;
      explanationNodes: ImpactExplanationNode[];
      /** Human-readable chain: "A → B → C" */
      explanationText: string;
      /** Why this path was chosen (auditable selection policy). */
      selectionPolicy: 'ShortestHard' | 'ShortestSoftOnly';
    }
  | { ok: false; error: string };

const normalizeId = (value: string) => (value ?? '').trim();
const compareStrings = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const pathTieKey = (p: ImpactPath) => `${p.pathLength}|${p.orderedElementIds.join('>')}|${p.orderedRelationshipIds.join('>')}|${p.pathId}`;

const resolveElement = (repo: { getElementById(id: string): BaseArchitectureElement | null }, id: string) => {
  const element = repo.getElementById(id);
  if (!element) {
    return { elementId: id, name: id } satisfies ImpactExplanationNode;
  }
  return {
    elementId: id,
    elementType: element.elementType,
    name: element.name || id,
  } satisfies ImpactExplanationNode;
};

/**
 * Produces a single "why" explanation for one impacted element.
 *
 * Selection rules (deterministic):
 * 1) Prefer the shortest path that contains a Hard dependency.
 * 2) Otherwise, prefer the shortest Soft-only path.
 *
 * Notes:
 * - This service expects `paths` to contain root→leaf prefixes (as produced by ImpactPathEnumerator).
 * - It does not return all paths; it selects one representative path.
 */
export class ImpactExplanation {
  explain(params: {
    rootElementId: string;
    impactedElementId: string;
    paths: readonly ImpactPath[];
  }): ImpactExplanationResult {
    const rootId = normalizeId(params.rootElementId);
    const impactedId = normalizeId(params.impactedElementId);

    if (!rootId) return { ok: false, error: 'rootElementId is required.' };
    if (!impactedId) return { ok: false, error: 'impactedElementId is required.' };
    if (impactedId === rootId) return { ok: false, error: 'impactedElementId must not equal rootElementId.' };

    // Prefer paths where the selected impacted element is the leaf.
    // ImpactPathEnumerator emits prefixes, so every reached element should appear as a leaf of some path.
    const leafPaths = (params.paths ?? []).filter((p) => {
      const ordered = p.orderedElementIds ?? [];
      return ordered.length > 0 && normalizeId(ordered[ordered.length - 1] ?? '') === impactedId;
    });

    if (leafPaths.length === 0) {
      return { ok: false, error: `No impact path found ending at impacted element "${impactedId}".` };
    }

    const hardCandidates = leafPaths
      .filter((p) => p.containsHardDependency)
      .slice()
      .sort((a, b) => a.pathLength - b.pathLength || compareStrings(pathTieKey(a), pathTieKey(b)));

    const softOnlyCandidates = leafPaths
      .filter((p) => !p.containsHardDependency && p.weakestDependencyStrength === 'Soft')
      .slice()
      .sort((a, b) => a.pathLength - b.pathLength || compareStrings(pathTieKey(a), pathTieKey(b)));

    const chosen = hardCandidates[0] ?? softOnlyCandidates[0];
    if (!chosen) {
      return {
        ok: false,
        error:
          'No eligible representative path found (expected at least a Hard path or a Soft-only path for this impacted element).',
      };
    }

    const selectionPolicy: 'ShortestHard' | 'ShortestSoftOnly' = hardCandidates[0] ? 'ShortestHard' : 'ShortestSoftOnly';

    const repo = getRepository();
    const explanationNodes = (chosen.orderedElementIds ?? [])
      .map((id) => normalizeId(id))
      .filter((id) => id.length > 0)
      .map((id) => resolveElement(repo, id));

    const explanationText = explanationNodes.map((n) => n.name).join(' → ');

    return {
      ok: true,
      rootElementId: rootId,
      impactedElementId: impactedId,
      representativePath: chosen,
      explanationNodes,
      explanationText,
      selectionPolicy,
    };
  }
}

export const impactExplanation = new ImpactExplanation();
