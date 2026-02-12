export type Criticality = 'low' | 'medium' | 'high';
export type Lifecycle = 'planned' | 'active' | 'deprecated';
export type DependencyType = 'sync' | 'async' | 'batch' | 'data' | 'auth';
export type DependencyStrength = 'hard' | 'soft';

export type AppNode = {
  id: string;
  name: string;
  criticality: Criticality;
  lifecycle: Lifecycle;
};

export type DependencyEdge = {
  from: string;
  to: string;
  dependencyType?: DependencyType;
  dependencyStrength?: DependencyStrength;
};

export type DependencyGraphData = {
  applications: AppNode[];
  dependencies: DependencyEdge[];
};
