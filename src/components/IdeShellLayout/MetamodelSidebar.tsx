import React from 'react';
import { useEaRepository } from '@/ea/EaRepositoryContext';
import ArchitectMetaModelEditor from './ArchitectMetaModelEditor';
import CustomMetaModelEditor from './CustomMetaModelEditor';
import MetamodelTree from './MetamodelTree';

const MetamodelSidebar: React.FC = () => {
  const { metadata } = useEaRepository();

  // CUSTOM (Architect Mode) repos get the full architect metamodel editor
  if (metadata?.initializationMode === 'CUSTOM') {
    return (
      <div>
        <ArchitectMetaModelEditor />
      </div>
    );
  }

  // Redly Framework repos: existing behavior (Custom framework checkbox + tree)
  if (metadata?.referenceFramework === 'Custom') {
    return (
      <div>
        <CustomMetaModelEditor />
        <MetamodelTree />
      </div>
    );
  }

  return <MetamodelTree />;
};

export default MetamodelSidebar;
