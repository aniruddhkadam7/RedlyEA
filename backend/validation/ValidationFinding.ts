export type ValidationSeverity = 'Info' | 'Warning' | 'Error';

/**
 * ValidationFinding (domain model).
 *
 * Audit output only:
 * - No auto-fix semantics
 * - No escalation semantics
 *
 * Time fields are ISO-8601 strings.
 */
export type ValidationFinding = {
  findingId: string;

  /** References the governing rule that produced the finding. */
  ruleId: string;

  affectedElementId: string;
  affectedElementType: string;

  severity: ValidationSeverity;
  /** Human-readable description suitable for audit logs and review. */
  message: string;

  detectedAt: string;
  /** System-generated finding (not a human actor). */
  detectedBy: 'system';
};
