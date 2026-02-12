import React, { useEffect, useMemo, useState } from 'react';

type Criticality = 'low' | 'medium' | 'high';
type Lifecycle = 'planned' | 'active' | 'deprecated';
type DependencyType = 'sync' | 'async' | 'batch' | 'data' | 'auth';
type DependencyStrength = 'hard' | 'soft';

export type ApplicationMetadata = {
  id: string;
  name: string;
  criticality: Criticality;
  lifecycle: Lifecycle;
};

export type DependencyMetadata = {
  sourceApplication: { id: string; name: string };
  targetApplication: { id: string; name: string };
  dependencyType?: DependencyType;
  dependencyStrength?: DependencyStrength;
};

export type ImpactSummary = {
  totalImpactedApplications: number;
  bySeverityLabel: Record<'High' | 'Medium' | 'Low', number>;
  maxDependencyDepthObserved: number;
};

export type ImpactAssumptions = {
  maxDepth: number;
  dependencyFilter: string;
};

export type RankedImpactItem = {
  applicationId: string;
  applicationName: string;
  severityScore: number;
  severityLabel: 'High' | 'Medium' | 'Low';
};

export type DatasetInfo = {
  source: string;
  applicationCount: number;
  dependencyCount: number;
  loadedAt: number;
};

type ApplicationSidePanelProps = {
  selectedApplication?: ApplicationMetadata;
  selectedDependency?: DependencyMetadata;
  impactSummary?: ImpactSummary;
  rankedImpacts?: RankedImpactItem[];
  impactPaths?: string[][];
  impactAssumptions?: ImpactAssumptions;
  datasetInfo?: DatasetInfo;
  applicationsForLookup?: Array<Pick<ApplicationMetadata, 'id' | 'name'>>;
  graphViewMode: 'landscape' | 'impact';
  rootApplication?: Pick<ApplicationMetadata, 'id' | 'name'>;
  impactDepth: 1 | 2 | 3;
};

const ApplicationSidePanel: React.FC<ApplicationSidePanelProps> = ({
  selectedApplication,
  selectedDependency,
  impactSummary,
  rankedImpacts,
  impactPaths,
  impactAssumptions,
  datasetInfo,
  applicationsForLookup,
  graphViewMode,
  rootApplication,
  impactDepth,
}) => {
  const [selectedRankedImpactId, setSelectedRankedImpactId] = useState<string | undefined>(undefined);

  useEffect(() => {
    setSelectedRankedImpactId(undefined);
  }, [selectedApplication?.id]);

  const nameById = useMemo(() => {
    const source = applicationsForLookup ?? [];
    return new Map<string, string>(source.map((a) => [a.id, a.name] as const));
  }, [applicationsForLookup]);

  const impactExplanation = useMemo(() => {
    const rootId = selectedApplication?.id;
    const targetId = selectedRankedImpactId;
    if (!rootId || !targetId) return undefined;
    if (!impactPaths || impactPaths.length === 0) return undefined;

    const examplePath = impactPaths.find((p) => p.length >= 2 && p[0] === rootId && p[p.length - 1] === targetId);
    if (!examplePath) return undefined;

    return examplePath.map((id) => nameById.get(id) ?? id).join(' → ');
  }, [impactPaths, nameById, selectedApplication?.id, selectedRankedImpactId]);

  return (
    <aside
      style={{
        width: 320,
        flex: '0 0 320px',
        borderLeft: '1px solid rgba(0,0,0,0.08)',
        paddingLeft: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <h2 style={{ margin: 0, fontSize: 16 }}>
        {selectedDependency ? 'Dependency Details' : 'Application Details'}
      </h2>

      <div style={{ height: 1, background: 'rgba(0,0,0,0.08)', margin: '8px 0' }} />
      <h3 style={{ margin: 0, fontSize: 14 }}>Graph Scope</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8 }}>
        <div style={{ opacity: 0.7 }}>Mode</div>
        <div>{graphViewMode === 'landscape' ? 'Landscape' : 'Impact'}</div>

        {graphViewMode === 'impact' ? (
          <>
            <div style={{ opacity: 0.7 }}>Root</div>
            <div>{rootApplication?.name ?? '-'}</div>

            <div style={{ opacity: 0.7 }}>Depth</div>
            <div>{impactDepth}</div>
          </>
        ) : null}
      </div>

      {!selectedApplication && !selectedDependency ? (
        <div style={{ opacity: 0.7 }}>Click a node or edge to view metadata.</div>
      ) : selectedDependency ? (
        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8 }}>
          <div style={{ opacity: 0.7 }}>Source</div>
          <div>{selectedDependency.sourceApplication.name}</div>

          <div style={{ opacity: 0.7 }}>Target</div>
          <div>{selectedDependency.targetApplication.name}</div>

          <div style={{ opacity: 0.7 }}>Type</div>
          <div>{selectedDependency.dependencyType ?? '-'}</div>

          <div style={{ opacity: 0.7 }}>Strength</div>
          <div>{selectedDependency.dependencyStrength ?? '-'}</div>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8 }}>
            <div style={{ opacity: 0.7 }}>Name</div>
            <div>{selectedApplication?.name}</div>

            <div style={{ opacity: 0.7 }}>Criticality</div>
            <div>{selectedApplication?.criticality}</div>

            <div style={{ opacity: 0.7 }}>Lifecycle</div>
            <div>{selectedApplication?.lifecycle}</div>
          </div>

          {impactSummary ? (
            <>
              <div style={{ height: 1, background: 'rgba(0,0,0,0.08)', margin: '8px 0' }} />
              <h3 style={{ margin: 0, fontSize: 14 }}>Impact Summary</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 8 }}>
                <div style={{ opacity: 0.7 }}>Total impacted</div>
                <div>{impactSummary.totalImpactedApplications}</div>

                <div style={{ opacity: 0.7 }}>High severity</div>
                <div>{impactSummary.bySeverityLabel.High}</div>

                <div style={{ opacity: 0.7 }}>Medium severity</div>
                <div>{impactSummary.bySeverityLabel.Medium}</div>

                <div style={{ opacity: 0.7 }}>Low severity</div>
                <div>{impactSummary.bySeverityLabel.Low}</div>

                <div style={{ opacity: 0.7 }}>Max depth</div>
                <div>{impactSummary.maxDependencyDepthObserved}</div>
              </div>
            </>
          ) : null}

          {rankedImpacts && rankedImpacts.length > 0 ? (
            <>
              <div style={{ height: 1, background: 'rgba(0,0,0,0.08)', margin: '8px 0' }} />
              <h3 style={{ margin: 0, fontSize: 14 }}>Ranked Impacts</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                {rankedImpacts.map((item) => (
                  <div
                    key={item.applicationId}
                    style={{ lineHeight: 1.3 }}
                    onClick={() => setSelectedRankedImpactId(item.applicationId)}
                  >
                    {item.applicationName} — {item.severityLabel} ({item.severityScore})
                  </div>
                ))}
              </div>

              {impactExplanation ? (
                <>
                  <div style={{ height: 1, background: 'rgba(0,0,0,0.08)', margin: '8px 0' }} />
                  <div>Why is this impacted?</div>
                  <div>{impactExplanation}</div>
                </>
              ) : null}
            </>
          ) : null}

          <div style={{ height: 1, background: 'rgba(0,0,0,0.08)', margin: '8px 0' }} />
          <h3 style={{ margin: 0, fontSize: 14 }}>Impact Assumptions</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 8 }}>
            <div style={{ opacity: 0.7 }}>Direction</div>
            <div>Downstream</div>

            <div style={{ opacity: 0.7 }}>Max depth</div>
            <div>{impactAssumptions?.maxDepth ?? '-'}</div>

            <div style={{ opacity: 0.7 }}>Dependency filter</div>
            <div>{impactAssumptions?.dependencyFilter ?? '-'}</div>

            <div style={{ opacity: 0.7 }}>Data source</div>
            <div>{datasetInfo?.source ?? 'Hardcoded (temporary)'}</div>
          </div>

          {datasetInfo ? (
            <>
              <div style={{ height: 1, background: 'rgba(0,0,0,0.08)', margin: '8px 0' }} />
              <h3 style={{ margin: 0, fontSize: 14 }}>Dataset</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 8 }}>
                <div style={{ opacity: 0.7 }}>Source</div>
                <div>{datasetInfo.source}</div>

                <div style={{ opacity: 0.7 }}>Applications</div>
                <div>{datasetInfo.applicationCount}</div>

                <div style={{ opacity: 0.7 }}>Dependencies</div>
                <div>{datasetInfo.dependencyCount}</div>

                <div style={{ opacity: 0.7 }}>Loaded at</div>
                <div>{new Date(datasetInfo.loadedAt).toLocaleString()}</div>
              </div>
            </>
          ) : null}
        </>
      )}
    </aside>
  );
};

export default ApplicationSidePanel;
