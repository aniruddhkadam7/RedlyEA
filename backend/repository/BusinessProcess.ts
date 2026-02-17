import type { BaseArchitectureElement } from './BaseArchitectureElement';
import type { Capability } from './Capability';

export type ProcessFrequency = 'Ad-hoc' | 'Daily' | 'Weekly' | 'Monthly';

export type ProcessCriticality = 'High' | 'Medium' | 'Low';

/**
 * Business Process (process-level modeling without execution detail).
 */
export type BusinessProcess = BaseArchitectureElement & {
  // Classification narrowing
  elementType: 'BusinessProcess';

  // Process semantics
  processOwner: string;
  triggeringEvent: string;
  expectedOutcome: string;

  // Operational
  frequency: ProcessFrequency;
  criticality: ProcessCriticality;

  // Compliance
  regulatoryRelevant: boolean;
  complianceNotes: string;

  // Linkage
  parentCapabilityId: Capability['id'];
};
