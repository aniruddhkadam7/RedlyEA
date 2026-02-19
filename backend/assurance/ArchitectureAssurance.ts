import { validateRelationshipRepository } from '../analysis/RelationshipValidation';
import { auditRepositoryIntegrity } from '../analysis/RepositoryIntegrityAudit';
import { validateArchitectureRepository } from '../analysis/RepositoryValidation';
import type { ArchitectureRepository } from '../repository/ArchitectureRepository';
import type { BaseArchitectureElement } from '../repository/BaseArchitectureElement';
import type { RelationshipRepository } from '../repository/RelationshipRepository';
import type { ViewDefinition } from '../views/ViewDefinition';
import { evaluateViewGovernance } from '../views/ViewGovernance';
import {
  type AssuranceCheckMeta,
  getAssuranceCheckMeta,
} from './AssuranceCatalog';
import {
  type AssurancePolicy,
  type AssuranceSeverity,
  ENTERPRISE_ASSURANCE_POLICY,
} from './AssurancePolicy';

export type AssuranceDomain =
  | 'RepositoryValidation'
  | 'RelationshipValidation'
  | 'IntegrityAudit'
  | 'ViewGovernance';

export type AssuranceFinding = {
  id: string;
  domain: AssuranceDomain;
  checkId: string;
  severity: AssuranceSeverity;
  message: string;
  observedAt: string;

  subjectKind: 'Element' | 'Relationship' | 'View';
  subjectId: string;
  subjectType: string;

  explanation?: AssuranceCheckMeta;
};

export type ArchitectureAssuranceReport = {
  observedAt: string;
  policy: AssurancePolicy;
  findings: AssuranceFinding[];
  enforcement: {
    compliant: boolean;
    blockingSeverities: readonly AssuranceSeverity[];
    blockingCount: number;
  };
  summary: {
    total: number;
    bySeverity: Record<AssuranceSeverity, number>;
    byDomain: Record<AssuranceDomain, number>;
  };
};

const increment = (obj: Record<string, number>, key: string) => {
  obj[key] = (obj[key] ?? 0) + 1;
};

const rankSeverity = (s: AssuranceSeverity): number =>
  s === 'Error' ? 3 : s === 'Warning' ? 2 : 1;

const applySeverityOverride = (
  policy: AssurancePolicy,
  checkId: string,
  current: AssuranceSeverity,
): AssuranceSeverity => {
  const override = policy.severityOverrides[checkId];
  return override ?? current;
};

/**
 * Architecture assurance (passive).
 *
 * One responsibility: produce a single, explainable, non-destructive assurance report.
 * - Explicit: includes the policy used
 * - Reviewable: policy + check catalog are data-first
 * - Enforceable: computes a compliant/blocking result (caller chooses to gate or not)
 */
export function evaluateArchitectureAssurance(input: {
  elements: ArchitectureRepository;
  relationships: RelationshipRepository;
  views?: readonly ViewDefinition[];
  /** Optional resolver to provide resolved view elements for governance checks (non-destructive). */
  resolveViewElements?: (
    view: ViewDefinition,
  ) => readonly BaseArchitectureElement[];
  now?: Date;
  policy?: AssurancePolicy;
}): ArchitectureAssuranceReport {
  const now = input.now ?? new Date();
  const observedAt = now.toISOString();
  const policy = input.policy ?? ENTERPRISE_ASSURANCE_POLICY;

  const findings: AssuranceFinding[] = [];

  if (policy.enabledDomains.repositoryValidation) {
    const report = validateArchitectureRepository(input.elements, now);
    for (const f of report.findings) {
      const severity = applySeverityOverride(policy, f.checkId, f.severity);
      findings.push({
        id: `RepositoryValidation:${f.id}`,
        domain: 'RepositoryValidation',
        checkId: f.checkId,
        severity,
        message: f.message,
        observedAt: f.observedAt,
        subjectKind: 'Element',
        subjectId: f.elementId,
        subjectType: f.elementType,
        explanation: getAssuranceCheckMeta(f.checkId) ?? undefined,
      });
    }
  }

  if (policy.enabledDomains.relationshipValidation) {
    const report = validateRelationshipRepository(
      input.elements,
      input.relationships,
      now,
    );
    for (const f of report.findings) {
      const severity = applySeverityOverride(policy, f.checkId, f.severity);
      const subjectKind =
        f.subjectKind === 'Relationship' ? 'Relationship' : 'Element';
      findings.push({
        id: `RelationshipValidation:${f.id}`,
        domain: 'RelationshipValidation',
        checkId: f.checkId,
        severity,
        message: f.message,
        observedAt: f.observedAt,
        subjectKind,
        subjectId: f.subjectId,
        subjectType: f.subjectType,
        explanation: getAssuranceCheckMeta(f.checkId) ?? undefined,
      });
    }
  }

  if (policy.enabledDomains.integrityAudit) {
    const report = auditRepositoryIntegrity(
      input.elements,
      input.relationships,
      now,
    );
    for (const f of report.findings) {
      const severity = applySeverityOverride(policy, f.checkId, f.severity);
      const subjectKind =
        f.subjectKind === 'Relationship' ? 'Relationship' : 'Element';
      findings.push({
        id: `IntegrityAudit:${f.id}`,
        domain: 'IntegrityAudit',
        checkId: f.checkId,
        severity,
        message: f.message,
        observedAt: f.observedAt,
        subjectKind,
        subjectId: f.subjectId,
        subjectType: f.subjectType,
        explanation: getAssuranceCheckMeta(f.checkId) ?? undefined,
      });
    }
  }

  if (policy.enabledDomains.viewGovernance) {
    for (const view of input.views ?? []) {
      const resolvedElements = input.resolveViewElements
        ? input.resolveViewElements(view)
        : undefined;
      const report = evaluateViewGovernance(view, { now, resolvedElements });
      for (const f of report.findings) {
        const severity = applySeverityOverride(policy, f.checkId, f.severity);
        findings.push({
          id: `ViewGovernance:${f.id}`,
          domain: 'ViewGovernance',
          checkId: f.checkId,
          severity,
          message: f.message,
          observedAt: f.observedAt,
          subjectKind: f.subjectKind === 'View' ? 'View' : 'Element',
          subjectId: f.subjectId,
          subjectType: f.subjectType ?? 'Unknown',
          explanation: getAssuranceCheckMeta(f.checkId) ?? undefined,
        });
      }
    }
  }

  findings.sort(
    (a, b) =>
      rankSeverity(b.severity) - rankSeverity(a.severity) ||
      a.domain.localeCompare(b.domain) ||
      a.checkId.localeCompare(b.checkId) ||
      a.subjectKind.localeCompare(b.subjectKind) ||
      a.subjectType.localeCompare(b.subjectType) ||
      a.subjectId.localeCompare(b.subjectId) ||
      a.id.localeCompare(b.id),
  );

  const bySeverity: Record<AssuranceSeverity, number> = {
    Info: 0,
    Warning: 0,
    Error: 0,
  };
  const byDomain: Record<AssuranceDomain, number> = {
    RepositoryValidation: 0,
    RelationshipValidation: 0,
    IntegrityAudit: 0,
    ViewGovernance: 0,
  };

  for (const f of findings) {
    increment(bySeverity, f.severity);
    increment(byDomain, f.domain);
  }

  const blockingSeverities = policy.failOnSeverities;
  const blockingCount = findings.filter((f) =>
    blockingSeverities.includes(f.severity),
  ).length;

  return {
    observedAt,
    policy,
    findings,
    enforcement: {
      compliant: blockingCount === 0,
      blockingSeverities,
      blockingCount,
    },
    summary: {
      total: findings.length,
      bySeverity,
      byDomain,
    },
  };
}
