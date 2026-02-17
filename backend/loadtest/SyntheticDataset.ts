import type { ArchitectureRepository } from '../repository/ArchitectureRepository';
import type { RelationshipRepository } from '../repository/RelationshipRepository';

export type SyntheticDataset = {
  repo: ArchitectureRepository;
  relRepo: RelationshipRepository;
  ids: {
    programmes: readonly string[];
    capabilities: readonly string[];
    businessProcesses: readonly string[];
    applications: readonly string[];
    technologies: readonly string[];
  };
  stats: {
    elements: number;
    relationships: number;
    byType: Record<string, number>;
    relationshipsByType: Record<string, number>;
  };
};
