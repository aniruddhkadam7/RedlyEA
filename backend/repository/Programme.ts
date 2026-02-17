import type { BaseArchitectureElement } from './BaseArchitectureElement';

export type ProgrammeType = 'Transformation' | 'Compliance' | 'Modernization';

export type FundingStatus = 'Approved' | 'Proposed' | 'Rejected';

export type RiskLevel = 'High' | 'Medium' | 'Low';

/**
 * Programme (strategy-to-architecture traceability).
 *
 * Note: This file does not define impacted elements.
 */
export type Programme = BaseArchitectureElement & {
  // Classification narrowing
  elementType: 'Programme';

  // Strategic context
  programmeType: ProgrammeType;
  strategicObjective: string;

  // Timeline
  /** ISO-8601 date (or timestamp) */
  startDate: string;
  /** ISO-8601 date (or timestamp) */
  endDate: string;

  // Financial
  budgetEstimate: number;
  fundingStatus: FundingStatus;

  // Impact
  expectedBusinessImpact: string;
  riskLevel: RiskLevel;
};
