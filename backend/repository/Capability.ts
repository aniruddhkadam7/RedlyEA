import type { BaseArchitectureElement } from './BaseArchitectureElement';

export type CapabilityLevel = 'L1' | 'L2' | 'L3';

export type StrategicImportance = 'High' | 'Medium' | 'Low';

export type MaturityLevel = 1 | 2 | 3 | 4 | 5;

/**
 * Business Capability (enterprise-grade domain model).
 *
 * Constraint (by governance):
 * - `parentCapabilityId`, when present, must reference the `id` of another `Capability`.
 *
 * Note: This file defines the Capability entity only; it does not define relationships or enforcement logic.
 */
export type Capability = BaseArchitectureElement & {
  // Classification narrowing
  elementType: 'Capability';

  // Business semantics
  capabilityLevel: CapabilityLevel;
  parentCapabilityId: Capability['id'] | null;
  businessOutcome: string;
  valueStream?: string;

  // Scope
  inScope: boolean;
  impactedByChange: boolean;

  // Metrics
  strategicImportance: StrategicImportance;
  maturityLevel: MaturityLevel;
};
