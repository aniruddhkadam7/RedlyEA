export type DependencyStrength = 'Hard' | 'Soft' | 'Unknown';

export type ImpactCriticality = 'High' | 'Medium' | 'Low' | 'Unknown';

/**
 * ImpactPath preserves a single causal chain from a root element to a leaf element.
 *
 * Principles:
 * - Deterministic and auditable: preserves ordered IDs (no inference here).
 * - Computation-free domain model: derived fields are explicit properties but not computed here.
 */
export type ImpactPath = {
  // Identity
  readonly pathId: string;

  // Causal chain (root -> leaf)
  orderedElementIds: readonly string[];
  orderedRelationshipIds: readonly string[];

  // Basic metrics
  /** Number of relationships/hops in the path (typically equals orderedRelationshipIds.length) */
  pathLength: number;
  containsHardDependency: boolean;

  // Derived metadata (provided by an analysis engine; not computed here)
  weakestDependencyStrength: DependencyStrength;
  maxCriticalityOnPath: ImpactCriticality;
};
