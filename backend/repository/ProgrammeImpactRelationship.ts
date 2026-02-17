import type { BaseArchitectureRelationship } from './BaseArchitectureRelationship';

export type ImpactType = 'Create' | 'Modify' | 'Retire';

export type ExpectedChangeMagnitude = 'High' | 'Medium' | 'Low';

export type ProgrammeImpactTargetElementType = 'Capability' | 'Application' | 'Technology';

/**
 * Programme → (Capability | Application | Technology) impact relationship.
 *
 * Semantics:
 * - Typed, directional, auditable relationship for strategy-to-execution linkage.
 * - Captures intent/impact without implying implementation detail.
 * - Timelines are not enforced here.
 */
export type ProgrammeImpactRelationship = BaseArchitectureRelationship & {
  relationshipType: 'IMPACTS';

  sourceElementType: 'Programme';
  targetElementType: ProgrammeImpactTargetElementType;

  direction: 'OUTGOING';

  impactType: ImpactType;
  expectedChangeMagnitude: ExpectedChangeMagnitude;
};
