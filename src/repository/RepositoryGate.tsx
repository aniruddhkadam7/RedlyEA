import React from 'react';

import { useEaRepository } from '@/ea/EaRepositoryContext';

export type RepositoryGateProps = {
  /** Rendered when there is no repository yet. */
  children?: React.ReactNode;

  /** Rendered when a repository exists. */
  shell: React.ReactNode;
};

/**
 * Structural gate for controlling access to repository-enabled UI.
 *
 * - loading: renders nothing
 * - no repository: renders children (first-launch gate)
 * - repository exists: renders shell
 */
const RepositoryGate: React.FC<RepositoryGateProps> = ({ children, shell }) => {
  const { eaRepository, metadata, loading } = useEaRepository();

  if (loading) return null;
  if (!eaRepository || !metadata) return <>{children ?? null}</>;
  return <>{shell}</>;
};

export default RepositoryGate;
