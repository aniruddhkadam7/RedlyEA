import type { CopilotInteractionContract } from './contracts';

export type CopilotExecutorResult = {
  outputType: 'explanation' | 'suggestion' | 'warning' | 'scenario';
  payload: unknown;
};

/**
 * Extension point (plugin-ready).
 *
 * Implementations may be:
 * - local AI
 * - cloud AI
 * - rule-based engines
 *
 * This repo intentionally provides NO implementation.
 */
export interface CopilotExecutor {
  execute(contract: CopilotInteractionContract): Promise<CopilotExecutorResult>;
}

let activeExecutor: CopilotExecutor | null = null;

export function registerCopilotExecutor(executor: CopilotExecutor) {
  activeExecutor = executor;
}

export function getCopilotExecutor(): CopilotExecutor | null {
  return activeExecutor;
}
