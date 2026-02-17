import React from 'react';
import { useIdeShell } from '@/components/IdeShellLayout';

/**
 * Route page for /workspace/model-library.
 * Opens the Model Library workspace tab and redirects focus there
 * so the full-page catalog renders in the editor area.
 */
const ModelLibraryPage: React.FC = () => {
  const { openWorkspaceTab } = useIdeShell();

  React.useEffect(() => {
    openWorkspaceTab({ type: 'model-library' });
  }, [openWorkspaceTab]);

  return null;
};

export default ModelLibraryPage;
