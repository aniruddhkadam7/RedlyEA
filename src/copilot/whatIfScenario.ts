/**
 * What-If simulation framework (model only).
 *
 * Rules:
 * - Scenarios are NOT executed
 * - Scenarios are NOT persisted yet
 * - No impact is computed here
 * - Repository is never modified from this module
 */

export type WhatIfHypotheticalChange =
  | {
      type: 'remove_element';
      elementId: string;
    }
  | {
      type: 'change_relationship';
      relationshipId: string;
      change: {
        fromElementId?: string;
        toElementId?: string;
        relationshipType?: string;
      };
    }
  | {
      type: 'degrade_capability';
      capabilityId: string;
      degradationLevel: 'minor' | 'major' | 'critical';
    };

export type WhatIfScenario = {
  scenarioId: string;
  description: string;
  hypotheticalChange: WhatIfHypotheticalChange;
  affectedScope: {
    /** Optional scoping key(s) such as domain, layer, view, or catalogue identifiers. */
    keys: string[];
  };
};
