/**
 * Connection Resolution Module — Public API
 *
 * User-first EA connection resolution system that replaces rule-first validation.
 * Allows dragging any element onto any other element and resolves the best
 * connection path automatically.
 */

export type { ConnectionEditorProps } from './ConnectionEditor';
export { ConnectionEditor } from './ConnectionEditor';
// ─── Core Engine ─────────────────────────────────────────────────────
export {
  findDirectRelationships,
  findIndirectPaths,
  resolveConnection,
  resolveConnectionsForSource,
} from './connectionResolutionEngine';
// ─── Visual Feedback ─────────────────────────────────────────────────
export {
  CONNECTION_FEEDBACK_CLASSES,
  CONNECTION_FEEDBACK_COLORS,
  clearConnectionFeedbackClasses,
  getConnectionFeedback,
  getConnectionFeedbackStyles,
} from './connectionVisualFeedback';
export type {
  ConnectionPaletteSelection,
  InlineConnectionPaletteProps,
} from './InlineConnectionPalette';
// ─── React Components ───────────────────────────────────────────────
export { InlineConnectionPalette } from './InlineConnectionPalette';
// ─── Types ───────────────────────────────────────────────────────────
export type {
  ConnectionEditAction,
  ConnectionFeedbackKind,
  ConnectionResolution,
  ConnectionResolutionKind,
  ConnectionVisualFeedback,
  CreatedConnection,
  DirectRelationship,
  IndirectHop,
  IndirectPath,
} from './types';
export type {
  ConnectionResolutionState,
  UseConnectionResolutionOptions,
} from './useConnectionResolution';
// ─── React Hook ──────────────────────────────────────────────────────
export { useConnectionResolution } from './useConnectionResolution';
