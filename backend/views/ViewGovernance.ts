import type { BaseArchitectureElement } from '../repository/BaseArchitectureElement';
import { getRepository } from '../repository/RepositoryStore';
import type { ViewDefinition } from './ViewDefinition';

export type ViewGovernanceSeverity = 'Warning';

export type ViewGovernanceCheckId =
  | 'VIEW_REFERENCES_RETIRED_ELEMENTS'
  | 'VIEW_DEPTH_EXCEEDS_MAX'
  | 'VIEW_MISSING_DESCRIPTION';

export type ViewGovernanceFinding = {
  id: string;
  checkId: ViewGovernanceCheckId;
  severity: ViewGovernanceSeverity;
  message: string;
  observedAt: string;

  viewId: string;
  viewType: string;

  subjectKind: 'View' | 'Element';
  subjectId: string;
  subjectType?: string;
};

export type ViewGovernanceReport = {
  observedAt: string;
  findings: ViewGovernanceFinding[];
  summary: {
    totalWarnings: number;
    byCheckId: Partial<Record<ViewGovernanceCheckId, number>>;
  };
};

const ENTERPRISE_MAX_VIEW_DEPTH = 6;

const isBlank = (value: unknown): boolean =>
  typeof value !== 'string' || value.trim().length === 0;

const increment = (obj: Record<string, number>, key: string) => {
  obj[key] = (obj[key] ?? 0) + 1;
};

const makeFindingId = (checkId: ViewGovernanceCheckId, subjectId: string) =>
  `${checkId}:${subjectId}`;

const isRetired = (e: BaseArchitectureElement | null): boolean =>
  Boolean(e && e.lifecycleStatus === 'Retired');

/**
 * Passive governance checks for view definitions.
 *
 * - No blocking
 * - No mutation
 * - Deterministic output ordering
 */
export function evaluateViewGovernance(
  view: ViewDefinition,
  input: {
    resolvedElements?: readonly BaseArchitectureElement[];
    now?: Date;
  } = {},
): ViewGovernanceReport {
  const now = input.now ?? new Date();
  const observedAt = now.toISOString();

  const findings: ViewGovernanceFinding[] = [];

  // 1) View without description.
  if (isBlank(view.description)) {
    findings.push({
      id: makeFindingId('VIEW_MISSING_DESCRIPTION', view.id),
      checkId: 'VIEW_MISSING_DESCRIPTION',
      severity: 'Warning',
      message:
        'View is missing a description. Add intent/context to support governance and reuse.',
      observedAt,
      viewId: view.id,
      viewType: view.viewType,
      subjectKind: 'View',
      subjectId: view.id,
      subjectType: view.viewType,
    });
  }

  // 2) Depth exceeds enterprise maximum.
  if (
    typeof view.maxDepth === 'number' &&
    view.maxDepth > ENTERPRISE_MAX_VIEW_DEPTH
  ) {
    findings.push({
      id: makeFindingId('VIEW_DEPTH_EXCEEDS_MAX', view.id),
      checkId: 'VIEW_DEPTH_EXCEEDS_MAX',
      severity: 'Warning',
      message: `View maxDepth (${view.maxDepth}) exceeds the enterprise maximum (${ENTERPRISE_MAX_VIEW_DEPTH}). Consider narrowing scope for determinism and usability.`,
      observedAt,
      viewId: view.id,
      viewType: view.viewType,
      subjectKind: 'View',
      subjectId: view.id,
      subjectType: view.viewType,
    });
  }

  // 3) View referencing retired elements.
  const repo = getRepository();

  const retiredElements: BaseArchitectureElement[] = [];

  const rootId = (view.rootElementId ?? '').trim();
  if (rootId) {
    const root = repo.getElementById(rootId);
    if (isRetired(root)) retiredElements.push(root!);
  }

  for (const e of input.resolvedElements ?? []) {
    if (e.lifecycleStatus === 'Retired') retiredElements.push(e);
  }

  // Unique by id.
  const retiredById = new Map<string, BaseArchitectureElement>();
  for (const e of retiredElements) retiredById.set(e.id, e);

  const retiredList = Array.from(retiredById.values()).sort(
    (a, b) =>
      a.elementType.localeCompare(b.elementType) ||
      a.name.localeCompare(b.name) ||
      a.id.localeCompare(b.id),
  );

  if (retiredList.length > 0) {
    for (const e of retiredList) {
      findings.push({
        id: makeFindingId(
          'VIEW_REFERENCES_RETIRED_ELEMENTS',
          `${view.id}:${e.id}`,
        ),
        checkId: 'VIEW_REFERENCES_RETIRED_ELEMENTS',
        severity: 'Warning',
        message: `View includes a Retired element: ${e.elementType} "${e.name}" (${e.id}).`,
        observedAt,
        viewId: view.id,
        viewType: view.viewType,
        subjectKind: 'Element',
        subjectId: e.id,
        subjectType: e.elementType,
      });
    }
  }

  findings.sort(
    (a, b) =>
      a.checkId.localeCompare(b.checkId) ||
      a.subjectKind.localeCompare(b.subjectKind) ||
      a.subjectId.localeCompare(b.subjectId),
  );

  const byCheckId: Partial<Record<ViewGovernanceCheckId, number>> = {};
  for (const f of findings)
    increment(byCheckId as Record<string, number>, f.checkId);

  return {
    observedAt,
    findings,
    summary: {
      totalWarnings: findings.length,
      byCheckId,
    },
  };
}

export const ENTERPRISE_VIEW_GOVERNANCE_POLICY = {
  maxDepth: ENTERPRISE_MAX_VIEW_DEPTH,
} as const;
