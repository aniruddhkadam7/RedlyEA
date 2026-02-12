import type React from 'react';

import type { CopilotExecutor } from '@/copilot/executor';
import { registerCopilotExecutor } from '@/copilot/executor';

/**
 * Copilot extension point (plugin-ready).
 *
 * Rules:
 * - No vendor binding
 * - Executor is swappable
 * - Panel is swappable
 *
 * Possible future implementations:
 * - local AI
 * - cloud AI
 * - rule-based engines
 */

export type CopilotPanelComponent = React.ComponentType;

export type CopilotExtension = {
  /** Unique id for the extension (e.g. 'local-ai', 'rules-engine'). */
  id: string;

  /** Optional replacement panel UI. */
  panel?: CopilotPanelComponent;

  /** Optional executor implementation (still must respect safety rules). */
  executor?: CopilotExecutor;
};

let activeExtension: CopilotExtension | null = null;

export function registerCopilotExtension(extension: CopilotExtension) {
  activeExtension = extension;

  // Executor remains swappable and independent.
  if (extension.executor) registerCopilotExecutor(extension.executor);
}

export function getCopilotExtension(): CopilotExtension | null {
  return activeExtension;
}

export function getCopilotPanelComponent(): CopilotPanelComponent | null {
  return activeExtension?.panel ?? null;
}
