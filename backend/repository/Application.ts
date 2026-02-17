import type { BaseArchitectureElement } from './BaseArchitectureElement';

export type ApplicationType = 'COTS' | 'Custom' | 'SaaS' | 'Legacy';

export type BusinessCriticality = 'Mission-Critical' | 'High' | 'Medium' | 'Low';

export type DeploymentModel = 'On-Prem' | 'Cloud' | 'Hybrid';

export type RiskLevel = 'High' | 'Medium' | 'Low';

/**
 * Enterprise Application (realistic application catalog entry).
 *
 * Constraint (by governance):
 * - `applicationCode` must be unique across all Applications.
 *
 * Note: This file does not define dependencies or hosting.
 */
export type Application = BaseArchitectureElement & {
  // Classification narrowing
  elementType: 'Application';

  // Application identity
  /** Unique application identifier, e.g. TATA-ERP-01 */
  applicationCode: string;
  applicationType: ApplicationType;

  // Operational
  businessCriticality: BusinessCriticality;
  /** Availability target as a percentage (e.g. 99.9). */
  availabilityTarget: number;
  deploymentModel: DeploymentModel;

  // Risk
  vendorLockInRisk: RiskLevel;
  technicalDebtLevel: RiskLevel;

  // Financial
  annualRunCost: number;
  vendorName: string;
};
