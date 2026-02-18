export type CopilotExpectedOutputType =
  | 'explanation'
  | 'suggestion'
  | 'warning'
  | 'scenario';

/**
 * Explicit intent values (deterministic, no free-text prompts).
 *
 * This is an API-ready contract for future execution engines.
 */
export type CopilotUserIntent =
  | 'explain_application'
  | 'simulate_outage_impact'
  | 'check_governance_compliance'
  | 'suggest_missing_relationships'
  | 'what_if_scenario';

export type CopilotInputContext = {
  /** Snapshot timestamp (ISO-8601). */
  capturedAt: string;

  project: {
    id: string;
    name: string;
    description?: string;
  } | null;

  selection: {
    kind:
      | 'none'
      | 'repository'
      | 'repositoryElement'
      | 'metamodel'
      | 'view'
      | 'analysis'
      | 'route'
      | 'workspace';
    keys: string[];
  };

  activeDocument: {
    kind: 'route' | 'workspace';
    key: string;
  };

  activeView: {
    viewId: string;
  } | null;

  analysis: {
    /** Indicates whether analysis results are available in the UI state. */
    available: boolean;
    /** Optional identifier for which analysis is currently in focus. */
    kind?: string;
    /** Short summary only; no computed insights here. */
    summary?: string;
  };

  governance: {
    /** Indicates whether governance checks have been executed and results are available. */
    available: boolean;
    violationsCount: number;
    summary?: string;
  };
};

export type CopilotInteractionContract = {
  inputContext: CopilotInputContext;
  userIntent: CopilotUserIntent;
  expectedOutputType: CopilotExpectedOutputType;
};
