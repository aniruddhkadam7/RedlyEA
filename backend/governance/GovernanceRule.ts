export type Uuid = string;

export type GovernanceRuleCategory =
  | 'Completeness'
  | 'Consistency'
  | 'Compliance'
  | 'Risk'
  | 'Lifecycle';

export type GovernanceRuleSeverity = 'Info' | 'Warning' | 'Error';

/**
 * GovernanceRule (domain model).
 *
 * Foundation only:
 * - Declarative intent (ruleExpression is not executable code)
 * - No execution engine
 * - No persistence concerns
 * - No UI concerns
 *
 * Time fields are ISO-8601 strings.
 */
export type GovernanceRule = {
  // Identity
  ruleId: Uuid;
  ruleName: string;
  ruleCategory: GovernanceRuleCategory;

  // Scope
  applicableElementTypes: readonly string[];
  /** Optional: some rules apply only to elements, not relationships. */
  applicableRelationshipTypes?: readonly string[];

  // Condition
  /** Declarative, non-executable expression (e.g., DSL/text policy statement). */
  ruleExpression: string;
  severity: GovernanceRuleSeverity;

  // Governance
  rationale: string;
  /** e.g., "EA Governance Board" */
  ownerRole: string;
  enabled: boolean;

  // Administrative
  createdAt: string;
  lastModifiedAt: string;
};
