import { BarChartOutlined } from '@ant-design/icons';
import { Tree } from 'antd';
import type { DataNode } from 'antd/es/tree';
import React from 'react';
import { useIdeShell } from './index';
import styles from './style.module.less';
import { useIdeSelection } from '@/ide/IdeSelectionContext';
import { useEaRepository } from '@/ea/EaRepositoryContext';
import { isGapAnalysisAllowedForLifecycleCoverage, isRoadmapAllowedForLifecycleCoverage } from '@/repository/lifecycleCoveragePolicy';

const buildTreeData = (includeRoadmap: boolean, includeGap: boolean): DataNode[] => [
  {
    key: 'analysis',
    title: 'Analysis',
    icon: <BarChartOutlined />,
    selectable: false,
    children: [
      { key: 'analysis:governance', title: 'Governance & Assurance', isLeaf: true },
      ...(includeRoadmap ? [{ key: 'analysis:roadmap', title: 'Roadmap', isLeaf: true } as DataNode] : []),
      { key: 'analysis:impact', title: 'Impact Analysis', isLeaf: true },
      { key: 'analysis:dependency', title: 'Dependency Analysis', isLeaf: true },
      ...(includeGap ? [{ key: 'analysis:gap', title: 'Gap Analysis', isLeaf: true } as DataNode] : []),
    ],
  },
];

const AnalysisTree: React.FC = () => {
  const { openWorkspaceTab, openRouteTab } = useIdeShell();
  const { setSelection } = useIdeSelection();
  const { metadata } = useEaRepository();

  const scope = metadata?.architectureScope ?? null;
  const includeRoadmap = scope !== 'Domain' && isRoadmapAllowedForLifecycleCoverage(metadata?.lifecycleCoverage);
  const includeGap = scope !== 'Domain' && isGapAnalysisAllowedForLifecycleCoverage(metadata?.lifecycleCoverage);
  const treeData = React.useMemo(() => buildTreeData(includeRoadmap, includeGap), [includeRoadmap, includeGap]);

  return (
    <div className={styles.explorerTree}>
      <Tree
        showIcon
        defaultExpandAll
        selectable
        treeData={treeData}
        onSelect={(selectedKeys: React.Key[]) => {
          const key = selectedKeys?.[0];
          if (typeof key !== 'string') return;

          setSelection({ kind: 'analysis', keys: [key] });

          if (key === 'analysis:governance') {
            openRouteTab('/governance');
            return;
          }

          if (key === 'analysis:impact') {
            openWorkspaceTab({ type: 'analysis', kind: 'impact' });
            return;
          }
          if (key === 'analysis:dependency') {
            openWorkspaceTab({ type: 'analysis', kind: 'dependency' });
            return;
          }
          if (key === 'analysis:roadmap') {
            openWorkspaceTab({ type: 'analysis', kind: 'roadmap' });
            return;
          }
          if (key === 'analysis:gap') {
            openWorkspaceTab({ type: 'analysis', kind: 'gap' });
            return;
          }
        }}
      />
    </div>
  );
};

export default AnalysisTree;
