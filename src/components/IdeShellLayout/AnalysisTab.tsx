import React from 'react';
import { Alert, Spin, Typography } from 'antd';
import DependencyAnalysisWorkspaceTab from './DependencyAnalysisWorkspaceTab';
import CoverageAnalysisWorkspaceTab from './CoverageAnalysisWorkspaceTab';
import RoadmapWorkspaceTab from './RoadmapWorkspaceTab';
import { useEaRepository } from '@/ea/EaRepositoryContext';
import { isGapAnalysisAllowedForLifecycleCoverage } from '@/repository/lifecycleCoveragePolicy';
import ErrorBoundary from '@/components/ErrorBoundary';

const LazyImpactAnalysisTab = React.lazy(() => import('./ImpactAnalysisTab'));

type AnalysisKind = 'impact' | 'dependency' | 'gap' | 'roadmap';

const TITLE_BY_KIND: Record<AnalysisKind, string> = {
  impact: 'Impact Analysis',
  dependency: 'Dependency Analysis',
  gap: 'Gap Analysis',
  roadmap: 'Roadmap',
};

const AnalysisTab: React.FC<{ kind: AnalysisKind }> = ({ kind }) => {
  const { metadata } = useEaRepository();

  if (kind === 'impact') {
    return (
      <ErrorBoundary>
        <React.Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}><Spin size="large" /><Typography.Text type="secondary" style={{ marginTop: 8 }}>Loading Impact Analysis…</Typography.Text></div>}>
          <LazyImpactAnalysisTab />
        </React.Suspense>
      </ErrorBoundary>
    );
  }

  if (kind === 'dependency') {
    return <DependencyAnalysisWorkspaceTab />;
  }

  if (kind === 'gap') {
    if (!isGapAnalysisAllowedForLifecycleCoverage(metadata?.lifecycleCoverage)) {
      return (
        <div style={{ padding: 12 }}>
          <Typography.Title level={5} style={{ marginTop: 0 }}>
            Gap Analysis
          </Typography.Title>
          <Alert
            type="warning"
            showIcon
            message="Gap Analysis is disabled in To-Be only mode"
            description="Gap Analysis requires an As-Is baseline. Change Lifecycle Coverage to 'As-Is' or 'Both' to run it."
          />
        </div>
      );
    }
    return <CoverageAnalysisWorkspaceTab />;
  }

  if (kind === 'roadmap') {
    return <RoadmapWorkspaceTab />;
  }

  return (
    <div style={{ padding: 12 }}>
      <Typography.Title level={5} style={{ marginTop: 0 }}>
        {TITLE_BY_KIND[kind]}
      </Typography.Title>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
        Placeholder analysis view. Analysis tabs should operate on repository data only and open results in read-only tabs.
      </Typography.Paragraph>
    </div>
  );
};

export type { AnalysisKind };
export default AnalysisTab;
