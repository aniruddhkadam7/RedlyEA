export type CopilotTelemetryEvent =
  | 'copilot_opened'
  | 'copilot_closed'
  | 'copilot_command_palette_opened'
  | 'copilot_context_snapshot_captured'
  | 'copilot_command_invoked';

export type CopilotTelemetryPayload =
  | {
      type: 'copilot_context_snapshot_captured';
      /** Approximate size in characters of the JSON snapshot (no content). */
      contextSizeChars: number;
    }
  | {
      type: 'copilot_command_invoked';
      commandId: string;
      /** Commands are disabled in this phase; tracked as a stub only. */
      enabled: boolean;
    }
  | {
      type: 'copilot_opened' | 'copilot_closed' | 'copilot_command_palette_opened';
      [key: string]: unknown;
    };

/**
 * Telemetry hook (disabled).
 *
 * Rules:
 * - No data is sent
 * - No tracking is enabled
 * - This is a no-op placeholder for future observability
 */
export function trackCopilotEvent(_event: CopilotTelemetryEvent, _payload?: CopilotTelemetryPayload | Record<string, unknown>) {
  // Intentionally disabled.
}
