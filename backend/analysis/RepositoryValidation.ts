import type { ArchitectureRepository } from '../repository/ArchitectureRepository';
import type { Application } from '../repository/Application';
import type { Capability } from '../repository/Capability';
import type { Technology } from '../repository/Technology';

export type ValidationSeverity = 'Info' | 'Warning' | 'Error';

export type ValidationCheckId =
  | 'CAPABILITY_MISSING_OWNER'
  | 'APPLICATION_MISSING_LIFECYCLE'
  | 'TECHNOLOGY_PAST_SUPPORT_END_DATE';

export type RepositoryValidationFinding = {
  id: string;
  checkId: ValidationCheckId;
  severity: ValidationSeverity;
  message: string;

  elementId: string;
  elementType: string;
  collection: 'capabilities' | 'applications' | 'technologies';

  observedAt: string;
};

export type RepositoryValidationReport = {
  observedAt: string;
  findings: RepositoryValidationFinding[];
  summary: {
    total: number;
    bySeverity: Record<ValidationSeverity, number>;
    byCheckId: Partial<Record<ValidationCheckId, number>>;
  };
};

const isBlank = (value: unknown): boolean => typeof value !== 'string' || value.trim().length === 0;

const makeFindingId = (checkId: ValidationCheckId, elementId: string) => `${checkId}:${elementId}`;

const increment = (obj: Record<string, number>, key: string) => {
  obj[key] = (obj[key] ?? 0) + 1;
};

function capabilityMissingOwner(capability: Capability): boolean {
  // Governance: "owner" is treated as a complete ownership tuple.
  return isBlank(capability.ownerRole) || isBlank(capability.ownerName) || isBlank(capability.owningUnit);
}

function applicationMissingLifecycle(application: Application): boolean {
  // Base lifecycle fields are mandatory but may be unpopulated (empty strings) in early stages.
  return isBlank(application.lifecycleStatus) || isBlank(application.lifecycleStartDate);
}

function technologyPastSupportEndDate(technology: Technology, nowMs: number): boolean {
  const parsed = Date.parse(technology.supportEndDate);
  if (Number.isNaN(parsed)) return false;
  return parsed < nowMs;
}

/**
 * Passive, read-only governance checks for the in-memory architecture repository.
 *
 * - No enforcement
 * - No blocking
 * - No persistence
 */
export function validateArchitectureRepository(repo: ArchitectureRepository, now: Date = new Date()): RepositoryValidationReport {
  const observedAt = now.toISOString();
  const nowMs = now.getTime();

  const findings: RepositoryValidationFinding[] = [];

  for (const capability of repo.getElementsByType('capabilities')) {
    if (capabilityMissingOwner(capability)) {
      findings.push({
        id: makeFindingId('CAPABILITY_MISSING_OWNER', capability.id),
        checkId: 'CAPABILITY_MISSING_OWNER',
        severity: 'Warning',
        message: 'Capability is missing ownership details (owner role, owner name, and/or owning unit).',
        elementId: capability.id,
        elementType: capability.elementType,
        collection: 'capabilities',
        observedAt,
      });
    }
  }

  for (const application of repo.getElementsByType('applications')) {
    if (applicationMissingLifecycle(application)) {
      findings.push({
        id: makeFindingId('APPLICATION_MISSING_LIFECYCLE', application.id),
        checkId: 'APPLICATION_MISSING_LIFECYCLE',
        severity: 'Warning',
        message: 'Application is missing lifecycle information (lifecycle status and/or lifecycle start date).',
        elementId: application.id,
        elementType: application.elementType,
        collection: 'applications',
        observedAt,
      });
    }
  }

  for (const technology of repo.getElementsByType('technologies')) {
    if (technologyPastSupportEndDate(technology, nowMs)) {
      findings.push({
        id: makeFindingId('TECHNOLOGY_PAST_SUPPORT_END_DATE', technology.id),
        checkId: 'TECHNOLOGY_PAST_SUPPORT_END_DATE',
        severity: 'Warning',
        message: 'Technology support end date is in the past.',
        elementId: technology.id,
        elementType: technology.elementType,
        collection: 'technologies',
        observedAt,
      });
    }
  }

  const bySeverity: Record<ValidationSeverity, number> = { Info: 0, Warning: 0, Error: 0 };
  const byCheckId: Partial<Record<ValidationCheckId, number>> = {};
  for (const finding of findings) {
    increment(bySeverity, finding.severity);
    increment(byCheckId as Record<string, number>, finding.checkId);
  }

  return {
    observedAt,
    findings,
    summary: {
      total: findings.length,
      bySeverity,
      byCheckId,
    },
  };
}
