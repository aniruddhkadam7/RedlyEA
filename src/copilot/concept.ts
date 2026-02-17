export type EaCopilotConcept = {
  name: 'EA Copilot';

  /**
   * High-level product positioning.
   *
   * Note: this is an IDE-side assistant concept, not an execution engine.
   */
  role: {
    summary: string;
    principles: string[];
  };

  /** Capabilities that may exist in later phases (not implemented here). */
  futureResponsibilities: string[];

  /** Explicit non-responsibilities to establish the safety boundary. */
  nonResponsibilities: string[];

  /** The trust boundary that must remain true, even when AI is introduced. */
  trustBoundary: {
    alwaysTrue: string[];
    notAllowed: string[];
  };
};

export const EA_COPILOT_CONCEPT: EaCopilotConcept = {
  name: 'EA Copilot',
  role: {
    summary:
      'An IDE-side assistant for senior enterprise architects that helps interpret architecture information and propose next steps, without executing changes.',
    principles: [
      'Never modifies repository data automatically.',
      'Always proposes; never executes.',
      'Behavior is explicit, reviewable, and auditable.',
      'No background execution; user intent is required for every action (future).',
    ],
  },
  futureResponsibilities: [
    'Explain architecture using repository data and active views (read-only).',
    'Assist with impact analysis workflows (propose what to analyze, not execute).',
    'Suggest relationships, views, and governance checks (proposals only).',
    'Answer structured “what-if” questions via scenario models (no execution).',
  ],
  nonResponsibilities: [
    'No automatic creation of elements.',
    'No silent edits or background changes.',
    'No background execution of analysis jobs.',
    'No direct write access to repository or governance state.',
  ],
  trustBoundary: {
    alwaysTrue: [
      'Repository remains the source of truth.',
      'Copilot is read-only with respect to repository state.',
      'All suggested actions require explicit user confirmation (future).',
    ],
    notAllowed: [
      'Applying changes without user confirmation.',
      'Running analysis automatically.',
      'Mutating data “behind the scenes”.',
    ],
  },
};
