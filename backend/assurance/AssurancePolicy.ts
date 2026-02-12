import policyJson from './enterpriseAssurancePolicy.json';

export type AssuranceSeverity = 'Info' | 'Warning' | 'Error';

export type AssurancePolicy = {
  version: 1;
  enabledDomains: {
    repositoryValidation: boolean;
    relationshipValidation: boolean;
    integrityAudit: boolean;
    viewGovernance: boolean;
  };
  /** Any finding at a severity in this list is considered a policy blocker. */
  failOnSeverities: readonly AssuranceSeverity[];
  /** Optional per-check severity adjustment (explicit and reviewable). */
  severityOverrides: Partial<Record<string, AssuranceSeverity>>;
};

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

const isAssuranceSeverity = (v: unknown): v is AssuranceSeverity => v === 'Info' || v === 'Warning' || v === 'Error';

function parseAssurancePolicy(raw: unknown): AssurancePolicy {
  if (!isObject(raw)) throw new Error('Invalid assurance policy: expected object.');

  const version = raw.version;
  if (version !== 1) throw new Error(`Invalid assurance policy: unsupported version "${String(version)}".`);

  const enabledDomainsRaw = raw.enabledDomains;
  if (!isObject(enabledDomainsRaw)) throw new Error('Invalid assurance policy: enabledDomains is required.');

  const enabledDomains = {
    repositoryValidation: Boolean(enabledDomainsRaw.repositoryValidation),
    relationshipValidation: Boolean(enabledDomainsRaw.relationshipValidation),
    integrityAudit: Boolean(enabledDomainsRaw.integrityAudit),
    viewGovernance: Boolean(enabledDomainsRaw.viewGovernance),
  } as const;

  const failOnSeveritiesRaw = raw.failOnSeverities;
  const failOnSeverities: AssuranceSeverity[] = Array.isArray(failOnSeveritiesRaw)
    ? failOnSeveritiesRaw.filter(isAssuranceSeverity)
    : ['Error'];

  const severityOverridesRaw = raw.severityOverrides;
  const severityOverrides: Partial<Record<string, AssuranceSeverity>> = {};

  if (isObject(severityOverridesRaw)) {
    for (const [key, value] of Object.entries(severityOverridesRaw)) {
      if (isAssuranceSeverity(value)) severityOverrides[key] = value;
    }
  }

  return {
    version: 1,
    enabledDomains,
    failOnSeverities,
    severityOverrides,
  };
}

export const ENTERPRISE_ASSURANCE_POLICY: AssurancePolicy = parseAssurancePolicy(policyJson);
