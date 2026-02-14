import { Menu } from 'antd';
import React from 'react';
import {
  DEFAULT_IMPACT_ANALYSIS_SECTION,
  dispatchImpactAnalysisSection,
  type ImpactAnalysisSectionKey,
} from '@/analysis/impactAnalysisMode';
import { useIdeShell } from './index';
import styles from './style.module.less';
import { useIdeSelection } from '@/ide/IdeSelectionContext';

const MENU_TO_SECTION: Record<string, ImpactAnalysisSectionKey> = {
  'analysis:overview': 'overview',
  'analysis:fragility': 'fragility',
  'analysis:simulation': 'simulation',
  'analysis:explorer': 'explorer',
  'analysis:health': 'health',
  'analysis:settings': 'settings',
};

const AnalysisTree: React.FC = () => {
  const { openWorkspaceTab } = useIdeShell();
  const { setSelection } = useIdeSelection();
  const [selectedKey, setSelectedKey] = React.useState<string>(`analysis:${DEFAULT_IMPACT_ANALYSIS_SECTION}`);

  return (
    <div className={styles.explorerTree}>
      <Menu
        mode="inline"
        selectedKeys={[selectedKey]}
        items={[
          { key: 'analysis:overview', label: '📊 Overview' },
          { key: 'analysis:fragility', label: '🔥 Fragility' },
          { key: 'analysis:simulation', label: '🧨 Impact Simulation' },
          { key: 'analysis:explorer', label: '🔗 Dependency Explorer' },
          { key: 'analysis:health', label: '📈 Structural Health' },
          { key: 'analysis:settings', label: '⚙ Settings' },
        ]}
        onClick={({ key }) => {
          const section = MENU_TO_SECTION[key];
          if (!section) return;

          setSelectedKey(key);
          setSelection({ kind: 'analysis', keys: [key] });
          openWorkspaceTab({ type: 'analysis', kind: 'impact' });
          dispatchImpactAnalysisSection(section);
        }}
      />
    </div>
  );
};

export default AnalysisTree;
