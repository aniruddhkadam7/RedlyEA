import type { BaseArchitectureElement } from './BaseArchitectureElement';

/**
 * Application Service.
 *
 * Core EA principle:
 * - Application services provide the traceability layer between business services and applications.
 *
 * Constraint (by governance):
 * - Belongs to exactly one Application.
 */
export type ApplicationService = BaseArchitectureElement & {
  elementType: 'ApplicationService';
};
