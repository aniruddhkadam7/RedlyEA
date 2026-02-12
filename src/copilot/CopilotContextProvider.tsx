import React from 'react';

import type { CopilotInputContext } from '@/copilot/contracts';
import { useEaProject } from '@/ea/EaProjectContext';
import { useIdeSelection } from '@/ide/IdeSelectionContext';
import { trackCopilotEvent } from '@/copilot/telemetry';
import { getAnalysisResult } from '@/analysis/analysisResultsStore';

export type CopilotContextSnapshot = CopilotInputContext;

export type CopilotContextValue = {
  /** Latest captured snapshot (read-only). */
  snapshot: CopilotContextSnapshot;

  /** Captures and returns a fresh snapshot. */
  captureSnapshot: () => CopilotContextSnapshot;
};

const CopilotContext = React.createContext<CopilotContextValue | undefined>(undefined);

const buildSnapshot = (args: {
  project: { id: string; name: string; description?: string } | null;
  selection: { kind: CopilotInputContext['selection']['kind']; keys: string[] };
  activeDocument: CopilotInputContext['activeDocument'];
}): CopilotContextSnapshot => {
  const capturedAt = new Date().toISOString();

  const activeViewId =
    args.activeDocument.kind === 'workspace' && args.activeDocument.key.startsWith('view:')
      ? args.activeDocument.key.slice('view:'.length)
      : args.selection.kind === 'view'
        ? args.selection.keys?.[0]
        : null;

  const analysisKind =
    args.activeDocument.kind === 'workspace' && args.activeDocument.key.startsWith('analysis:')
      ? args.activeDocument.key.slice('analysis:'.length)
      : args.activeDocument.kind === 'workspace' && args.activeDocument.key.startsWith('analysisResult:')
        ? getAnalysisResult(args.activeDocument.key.slice('analysisResult:'.length))?.kind
      : undefined;

  return {
    capturedAt,
    project: args.project,
    selection: {
      kind: args.selection.kind,
      keys: Array.isArray(args.selection.keys) ? args.selection.keys : [],
    },
    activeDocument: args.activeDocument,
    activeView: activeViewId ? { viewId: activeViewId } : null,
    analysis: {
      available: false,
      kind: analysisKind,
      summary: undefined,
    },
    governance: {
      available: false,
      violationsCount: 0,
      summary: undefined,
    },
  };
};

export const CopilotContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { project } = useEaProject();
  const { selection } = useIdeSelection();

  const projectSnapshot = React.useMemo(
    () =>
      project
        ? {
            id: project.id,
            name: project.name,
            description: project.description || undefined,
          }
        : null,
    [project],
  );

  const captureSnapshot = React.useCallback(() => {
    const next = buildSnapshot({
      project: projectSnapshot,
      selection: { kind: selection.kind, keys: selection.keys },
      activeDocument: selection.activeDocument,
    });

    // Telemetry hook (disabled): record snapshot size only.
    try {
      const contextSizeChars = JSON.stringify(next).length;
      trackCopilotEvent('copilot_context_snapshot_captured', {
        type: 'copilot_context_snapshot_captured',
        contextSizeChars,
      });
    } catch {
      // Best-effort only.
    }

    return next;
  }, [projectSnapshot, selection.kind, selection.keys, selection.activeDocument]);

  const [snapshot, setSnapshot] = React.useState<CopilotContextSnapshot>(() => captureSnapshot());

  React.useEffect(() => {
    // Snapshot updates are explicit and replace the entire context.
    // This is still read-only and does not grant mutation access.
    setSnapshot(captureSnapshot());
  }, [captureSnapshot]);

  const value = React.useMemo<CopilotContextValue>(
    () => ({ snapshot, captureSnapshot }),
    [snapshot, captureSnapshot],
  );

  return <CopilotContext.Provider value={value}>{children}</CopilotContext.Provider>;
};

export function useCopilotContext(): CopilotContextValue {
  const ctx = React.useContext(CopilotContext);
  if (!ctx) throw new Error('useCopilotContext must be used within CopilotContextProvider');
  return ctx;
}
