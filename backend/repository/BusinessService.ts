import type { BaseArchitectureElement } from './BaseArchitectureElement';

/**
 * Business Service.
 *
 * Core EA principle:
 * - Services define how value is delivered.
 *
 * Constraint (by governance):
 * - Must map to at least one Capability.
 */
export type BusinessService = BaseArchitectureElement & {
  elementType: 'BusinessService';
};
