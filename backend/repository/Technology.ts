import type { BaseArchitectureElement } from './BaseArchitectureElement';

export type TechnologyType = 'Infrastructure' | 'Platform' | 'Service';

export type TechnologyCategory =
  | 'Compute'
  | 'Storage'
  | 'Network'
  | 'Middleware';

export type RiskLevel = 'High' | 'Medium' | 'Low';

/**
 * Technology portfolio element.
 *
 * Constraint (by governance):
 * - Technology does not own business processes.
 *
 * Note: This file does not define hosting relationships.
 */
export type Technology = BaseArchitectureElement & {
  // Classification narrowing
  elementType: 'Technology';

  // Technology classification
  technologyType: TechnologyType;
  technologyCategory: TechnologyCategory;

  // Operational
  vendor: string;
  version: string;
  /** ISO-8601 date (or timestamp) */
  supportEndDate: string;

  // Risk
  obsolescenceRisk: RiskLevel;
  standardApproved: boolean;
};
