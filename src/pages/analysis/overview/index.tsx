/**
 * Architecture Intelligence Dashboard — /analysis/overview
 *
 * 9-row executive overview for the CIO.
 * Designed for instant situational awareness: vulnerabilities, dangerous systems,
 * change safety, and investment needs in under 10 seconds.
 */

import {
  AlertOutlined,
  ApartmentOutlined,
  BulbOutlined,
  ClusterOutlined,
  DashboardOutlined,
  ExclamationCircleOutlined,
  LinkOutlined,
  RadarChartOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Divider,
  Empty,
  Progress,
  Row,
  Space,
  Spin,
  Statistic,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import React from 'react';
import {
  type ArchitectureOverviewSnapshot,
  type CentralityNode,
  getArchitectureOverviewSnapshot,
  precomputeArchitectureOverviewInBackground,
} from '@/analysis/architectureOverviewEngine';
import {
  computeFragilityRiskSnapshot,
  type FragilityRiskSnapshot,
} from '@/analysis/fragilityRiskEngine';
import { dispatchImpactAnalysisSection } from '@/analysis/impactAnalysisMode';
import { getImpactAnalysisSnapshot } from '@/analysis/impactDependencyEngine';
import ErrorBoundary from '@/components/ErrorBoundary';
import { useIdeShell } from '@/components/IdeShellLayout';
import { useEaRepository } from '@/ea/EaRepositoryContext';

/* ---------- Safe chart imports ---------- */
let Pie: React.ComponentType<any> | null = null;
let Column: React.ComponentType<any> | null = null;
let Bar: React.ComponentType<any> | null = null;
let Area: React.ComponentType<any> | null = null;
let Treemap: React.ComponentType<any> | null = null;
let _Heatmap: React.ComponentType<any> | null = null;
let Bubble: React.ComponentType<any> | null = null;
try {
  /* eslint-disable @typescript-eslint/no-var-requires */
  const charts = require('@ant-design/charts');
  Pie = charts.Pie ?? charts.G2Plot?.Pie ?? null;
  Column = charts.Column ?? null;
  Bar = charts.Bar ?? null;
  Area = charts.Area ?? null;
  Treemap = charts.Treemap ?? null;
  _Heatmap = charts.Heatmap ?? null;
  Bubble = charts.Bubble ?? null;
  /* eslint-enable */
} catch {
  /* unavailable in test / SSR */
}

/* ---------- Constants ---------- */
const RISK_COLORS: Record<string, string> = {
  Critical: '#cf1322',
  High: '#d46b08',
  Medium: '#d4b106',
  Healthy: '#389e0d',
};

const HEALTH_COLOR = (s: number) =>
  s >= 80 ? '#52c41a' : s >= 60 ? '#faad14' : '#ff4d4f';

const FRAGILITY_COLOR = (s: number) =>
  s >= 70 ? '#cf1322' : s >= 40 ? '#d46b08' : '#52c41a';

const CARD_STYLE: React.CSSProperties = {
  height: '100%',
  boxShadow: '0 1px 4px rgba(0,0,0,.08)',
};

/* ---------- Small reusable chart wrappers ---------- */

const FallbackList: React.FC<{
  items: Array<{ label: string; value: number; color?: string }>;
}> = ({ items }) => (
  <Space direction="vertical" style={{ width: '100%' }}>
    {items.slice(0, 8).map((item) => (
      <div
        key={item.label}
        style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}
      >
        {item.color ? (
          <Badge color={item.color} text={item.label} />
        ) : (
          <Typography.Text>{item.label}</Typography.Text>
        )}
        <Typography.Text strong>{item.value}</Typography.Text>
      </div>
    ))}
  </Space>
);

/* ---------- Row 1: Executive Status Bar ---------- */
const Row1ExecutiveBar: React.FC<{
  snapshot: ArchitectureOverviewSnapshot;
  fragilitySnapshot: FragilityRiskSnapshot | null;
  onOpenImpact: () => void;
}> = ({ snapshot, fragilitySnapshot, onOpenImpact }) => (
  <Row gutter={[12, 12]} align="middle">
    {/* Health gauge */}
    <Col xs={24} md={4}>
      <Card size="small" style={{ ...CARD_STYLE, textAlign: 'center' }}>
        <Progress
          type="dashboard"
          percent={snapshot.healthScore}
          strokeColor={HEALTH_COLOR(snapshot.healthScore)}
          width={100}
          format={(p) => (
            <span
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: HEALTH_COLOR(p ?? 0),
              }}
            >
              {p}
            </span>
          )}
        />
        <Typography.Text
          type="secondary"
          style={{ fontSize: 11, display: 'block', marginTop: 2 }}
        >
          Architecture Health
        </Typography.Text>
      </Card>
    </Col>

    {/* Fragility gauge */}
    {fragilitySnapshot && (
      <Col xs={24} md={4}>
        <Card size="small" style={{ ...CARD_STYLE, textAlign: 'center' }}>
          <Progress
            type="dashboard"
            percent={fragilitySnapshot.aggregateFragilityScore}
            strokeColor={FRAGILITY_COLOR(
              fragilitySnapshot.aggregateFragilityScore,
            )}
            width={100}
            format={(p) => (
              <span
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  color: FRAGILITY_COLOR(p ?? 0),
                }}
              >
                {p}
              </span>
            )}
          />
          <Typography.Text
            type="secondary"
            style={{ fontSize: 11, display: 'block', marginTop: 2 }}
          >
            Fragility Score
          </Typography.Text>
        </Card>
      </Col>
    )}

    {/* KPI tiles */}
    <Col xs={24} md={fragilitySnapshot ? 16 : 20}>
      <Row gutter={[8, 8]}>
        {[
          {
            title: 'Systems',
            value: snapshot.totalSystemCount,
            icon: <ApartmentOutlined />,
            color: undefined as string | undefined,
          },
          {
            title: 'Critical',
            value: snapshot.criticalSystemCount,
            icon: <ExclamationCircleOutlined />,
            color: snapshot.criticalSystemCount > 0 ? '#cf1322' : '#52c41a',
          },
          {
            title: 'High Risk',
            value: snapshot.highRiskSystemCount,
            icon: <WarningOutlined />,
            color: snapshot.highRiskSystemCount > 0 ? '#d46b08' : '#52c41a',
          },
          {
            title: 'Unowned',
            value: snapshot.unownedSystemCount,
            icon: <TeamOutlined />,
            color: snapshot.unownedSystemCount > 0 ? '#d46b08' : '#52c41a',
          },
          {
            title: 'Critical Procs',
            value: snapshot.businessCriticalProcessCount,
            icon: <BulbOutlined />,
            color: undefined,
          },
          {
            title: 'SPOFs',
            value: fragilitySnapshot?.spofCandidates.length ?? 0,
            icon: <AlertOutlined />,
            color:
              (fragilitySnapshot?.spofCandidates.length ?? 0) > 0
                ? '#cf1322'
                : '#52c41a',
          },
          {
            title: 'Ext. Vendors',
            value: snapshot.externalVendorCount,
            icon: <SafetyCertificateOutlined />,
            color: snapshot.externalVendorCount > 5 ? '#d46b08' : undefined,
          },
          {
            title: 'Cycle Nodes',
            value: fragilitySnapshot?.cycleParticipantCount ?? 0,
            icon: <LinkOutlined />,
            color:
              (fragilitySnapshot?.cycleParticipantCount ?? 0) > 0
                ? '#d46b08'
                : '#52c41a',
          },
        ].map((kpi) => (
          <Col span={3} key={kpi.title}>
            <Card
              size="small"
              hoverable
              style={{ ...CARD_STYLE, textAlign: 'center', cursor: 'pointer' }}
              onClick={onOpenImpact}
            >
              <Statistic
                title={kpi.title}
                value={kpi.value}
                prefix={kpi.icon}
                valueStyle={
                  kpi.color
                    ? { color: kpi.color, fontSize: 20 }
                    : { fontSize: 20 }
                }
              />
            </Card>
          </Col>
        ))}
      </Row>
    </Col>
  </Row>
);

/* ---------- Row 2: Risk Distribution Charts ---------- */
const Row2RiskDistribution: React.FC<{
  snapshot: ArchitectureOverviewSnapshot;
}> = ({ snapshot }) => {
  const riskPieData = snapshot.riskDistribution
    .filter((d) => d.count > 0)
    .map((d) => ({ type: d.bucket, value: d.count }));

  const ownershipData = snapshot.ownershipCoverage.map((d) => ({
    type: d.label,
    value: d.count,
  }));
  const depColData = snapshot.dependencyLoadDistribution.map((d) => ({
    type: d.range,
    value: d.count,
  }));
  const envData = snapshot.environmentDistribution.map((d) => ({
    type: d.env,
    value: d.count,
  }));

  return (
    <Row gutter={[12, 12]}>
      <Col xs={24} md={6}>
        <Card size="small" title="Risk Distribution" style={CARD_STYLE}>
          {Pie && riskPieData.length > 0 ? (
            <ErrorBoundary>
              <Pie
                data={riskPieData}
                angleField="value"
                colorField="type"
                radius={0.85}
                height={200}
                legend={{ position: 'right' }}
                color={({ type }: { type: string }) =>
                  RISK_COLORS[type] ?? '#1677ff'
                }
                label={{
                  type: 'inner',
                  offset: '-30%',
                  style: { fontSize: 12 },
                }}
              />
            </ErrorBoundary>
          ) : (
            <FallbackList
              items={snapshot.riskDistribution.map((d) => ({
                label: d.bucket,
                value: d.count,
                color: RISK_COLORS[d.bucket],
              }))}
            />
          )}
        </Card>
      </Col>

      <Col xs={24} md={6}>
        <Card size="small" title="Ownership Coverage" style={CARD_STYLE}>
          {Pie && ownershipData.some((d) => d.value > 0) ? (
            <ErrorBoundary>
              <Pie
                data={ownershipData}
                angleField="value"
                colorField="type"
                radius={0.85}
                height={200}
                color={({ type }: { type: string }) =>
                  type === 'Owned' ? '#52c41a' : '#ff4d4f'
                }
                legend={{ position: 'right' }}
                label={{
                  type: 'inner',
                  offset: '-30%',
                  style: { fontSize: 12 },
                }}
              />
            </ErrorBoundary>
          ) : (
            <FallbackList
              items={snapshot.ownershipCoverage.map((d) => ({
                label: d.label,
                value: d.count,
                color: d.label === 'Owned' ? '#52c41a' : '#ff4d4f',
              }))}
            />
          )}
        </Card>
      </Col>

      <Col xs={24} md={6}>
        <Card size="small" title="Dependency Load Tiers" style={CARD_STYLE}>
          {Column && depColData.length > 0 ? (
            <ErrorBoundary>
              <Column
                data={depColData}
                xField="type"
                yField="value"
                height={200}
                color="#1677ff"
                label={{ position: 'top' }}
              />
            </ErrorBoundary>
          ) : (
            <FallbackList
              items={snapshot.dependencyLoadDistribution.map((d) => ({
                label: d.range,
                value: d.count,
              }))}
            />
          )}
        </Card>
      </Col>

      <Col xs={24} md={6}>
        <Card size="small" title="Deployment Environments" style={CARD_STYLE}>
          {Column && envData.length > 0 ? (
            <ErrorBoundary>
              <Column
                data={envData}
                xField="type"
                yField="value"
                height={200}
                color="#722ed1"
                label={{ position: 'top' }}
              />
            </ErrorBoundary>
          ) : (
            <FallbackList
              items={snapshot.environmentDistribution.map((d) => ({
                label: d.env,
                value: d.count,
              }))}
            />
          )}
        </Card>
      </Col>
    </Row>
  );
};

/* ---------- Row 3: Operational Risk Heatmap (Process × App) ---------- */
const Row3ProcessHeatmap: React.FC<{
  snapshot: ArchitectureOverviewSnapshot;
}> = ({ snapshot }) => {
  const { processes, cells } = snapshot.processCoverageMatrix;

  if (processes.length === 0 || cells.length === 0) {
    return (
      <Card
        size="small"
        title="Operational Risk Heatmap — Process × Application Coverage"
        style={CARD_STYLE}
      >
        <Empty description="No process-application relationships found" />
      </Card>
    );
  }

  // Build fast lookup
  const cellMap = new Map<string, (typeof cells)[0]>();
  for (const c of cells) cellMap.set(`${c.processId}::${c.appId}`, c);

  // Get unique apps from cells
  const appIds = Array.from(new Set(cells.map((c) => c.appId)));
  const appNames = new Map<string, string>();
  for (const c of cells) appNames.set(c.appId, c.appName);

  const statusColor = (status: 'single' | 'weak' | 'redundant') =>
    status === 'single' ? '#cf1322' : status === 'weak' ? '#d46b08' : '#52c41a';

  return (
    <Card
      size="small"
      title="Operational Risk Heatmap — Process × Application Coverage"
      style={CARD_STYLE}
    >
      <div style={{ overflowX: 'auto' }}>
        <table
          style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}
        >
          <thead>
            <tr>
              <th
                style={{
                  padding: '4px 8px',
                  textAlign: 'left',
                  borderBottom: '1px solid var(--ide-border, #303030)',
                  minWidth: 160,
                  fontWeight: 600,
                }}
              >
                Process
              </th>
              {appIds.map((aId) => (
                <th
                  key={aId}
                  style={{
                    padding: '4px 6px',
                    borderBottom: '1px solid var(--ide-border, #303030)',
                    fontWeight: 500,
                    maxWidth: 100,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    writingMode: 'vertical-rl',
                    textOrientation: 'mixed',
                  }}
                >
                  {appNames.get(aId) ?? aId}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {processes.map((proc, rowIdx) => (
              <tr
                key={proc.id}
                style={{
                  background:
                    rowIdx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.03)',
                }}
              >
                <td
                  style={{
                    padding: '3px 8px',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                  }}
                >
                  <Typography.Text ellipsis style={{ maxWidth: 160 }}>
                    {proc.name}
                  </Typography.Text>
                </td>
                {appIds.map((aId) => {
                  const cell = cellMap.get(`${proc.id}::${aId}`);
                  return (
                    <td
                      key={aId}
                      style={{
                        textAlign: 'center',
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                      }}
                    >
                      {cell ? (
                        <Tooltip
                          title={`${proc.name} → ${cell.appName} | ${cell.appCount} app(s) supporting`}
                        >
                          <div
                            style={{
                              width: 20,
                              height: 20,
                              borderRadius: 4,
                              background: statusColor(cell.status),
                              margin: '0 auto',
                              cursor: 'pointer',
                            }}
                          />
                        </Tooltip>
                      ) : (
                        <div
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: 4,
                            background: 'rgba(255,255,255,0.05)',
                            margin: '0 auto',
                          }}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Space size={16} style={{ marginTop: 8 }}>
        <Space size={4}>
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: 3,
              background: '#cf1322',
              display: 'inline-block',
            }}
          />
          <Typography.Text style={{ fontSize: 11 }}>
            Single app (SPOF)
          </Typography.Text>
        </Space>
        <Space size={4}>
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: 3,
              background: '#d46b08',
              display: 'inline-block',
            }}
          />
          <Typography.Text style={{ fontSize: 11 }}>
            2 apps (weak)
          </Typography.Text>
        </Space>
        <Space size={4}>
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: 3,
              background: '#52c41a',
              display: 'inline-block',
            }}
          />
          <Typography.Text style={{ fontSize: 11 }}>
            3+ apps (redundant)
          </Typography.Text>
        </Space>
      </Space>
    </Card>
  );
};

/* ---------- Row 4: Infrastructure Concentration ---------- */
const Row4Infrastructure: React.FC<{
  snapshot: ArchitectureOverviewSnapshot;
}> = ({ snapshot }) => {
  const { serverBubbles, dbSharingEdges } = snapshot;

  const bubbleData = serverBubbles
    .filter((s) => s.appCount > 0)
    .map((s) => ({
      name: s.name,
      value: s.appCount,
      group: s.criticality || 'Unknown',
    }));

  const dbGroups = new Map<string, { dbName: string; apps: string[] }>();
  dbSharingEdges.forEach(({ dbId, dbName, appName }) => {
    const g = dbGroups.get(dbId) ?? { dbName, apps: [] };
    if (!g.apps.includes(appName)) g.apps.push(appName);
    dbGroups.set(dbId, g);
  });
  const sharedDbs = Array.from(dbGroups.values()).sort(
    (a, b) => b.apps.length - a.apps.length,
  );

  return (
    <Row gutter={[12, 12]}>
      <Col xs={24} md={12}>
        <Card size="small" title="Server Load Concentration" style={CARD_STYLE}>
          {bubbleData.length === 0 ? (
            <Empty description="No server deployment relationships found" />
          ) : Bubble ? (
            <ErrorBoundary>
              <Bubble
                data={bubbleData}
                xField="name"
                yField="value"
                sizeField="value"
                colorField="group"
                height={220}
                legend={{ position: 'bottom' }}
              />
            </ErrorBoundary>
          ) : (
            <Space direction="vertical" style={{ width: '100%' }}>
              {serverBubbles.slice(0, 8).map((s) => (
                <div
                  key={s.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Typography.Text ellipsis style={{ maxWidth: 200 }}>
                    {s.name}
                  </Typography.Text>
                  <Progress
                    percent={Math.min(100, s.appCount * 10)}
                    size="small"
                    showInfo={false}
                    style={{ width: 100 }}
                  />
                  <Typography.Text
                    strong
                    style={{ minWidth: 40, textAlign: 'right' }}
                  >
                    {s.appCount} apps
                  </Typography.Text>
                </div>
              ))}
            </Space>
          )}
        </Card>
      </Col>

      <Col xs={24} md={12}>
        <Card size="small" title="Shared Database Risk" style={CARD_STYLE}>
          {sharedDbs.length === 0 ? (
            <Empty description="No shared databases detected" />
          ) : (
            <Space direction="vertical" style={{ width: '100%' }}>
              {sharedDbs.slice(0, 8).map(({ dbName, apps }) => (
                <div key={dbName}>
                  <Space style={{ marginBottom: 2 }}>
                    <Tag
                      color={
                        apps.length >= 4
                          ? 'error'
                          : apps.length >= 2
                            ? 'warning'
                            : 'default'
                      }
                    >
                      {apps.length} apps
                    </Tag>
                    <Typography.Text strong style={{ fontSize: 12 }}>
                      {dbName}
                    </Typography.Text>
                  </Space>
                  <div style={{ paddingLeft: 8 }}>
                    {apps.slice(0, 5).map((a) => (
                      <Tag key={a} style={{ fontSize: 11, margin: '2px 2px' }}>
                        {a}
                      </Tag>
                    ))}
                    {apps.length > 5 && (
                      <Tag style={{ fontSize: 11 }}>
                        +{apps.length - 5} more
                      </Tag>
                    )}
                  </div>
                </div>
              ))}
            </Space>
          )}
        </Card>
      </Col>
    </Row>
  );
};

/* ---------- Row 5: Vendor Risk Network ---------- */
const Row5VendorRisk: React.FC<{ snapshot: ArchitectureOverviewSnapshot }> = ({
  snapshot,
}) => {
  const { vendorNetwork } = snapshot;
  const { topVendors } = vendorNetwork;

  const barData = topVendors.slice(0, 8).map((v) => ({
    vendor: v.vendor,
    score: v.riskScore,
    systems: v.systemCount,
  }));

  return (
    <Row gutter={[12, 12]}>
      <Col xs={24} md={14}>
        <Card size="small" title="Vendor Concentration Risk" style={CARD_STYLE}>
          {barData.length === 0 ? (
            <Empty description="No external vendor data found" />
          ) : Bar ? (
            <ErrorBoundary>
              <Bar
                data={barData}
                xField="score"
                yField="vendor"
                height={220}
                colorField="vendor"
                label={{
                  position: 'right',
                  formatter: (d: any) => `${d.score}`,
                }}
                tooltip={{
                  formatter: (d: any) => ({
                    name: d.vendor,
                    value: `Risk: ${d.score} | Systems: ${d.systems}`,
                  }),
                }}
              />
            </ErrorBoundary>
          ) : (
            <Space direction="vertical" style={{ width: '100%' }}>
              {topVendors.slice(0, 8).map((v) => (
                <div
                  key={v.vendor}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Typography.Text ellipsis style={{ maxWidth: 180 }}>
                    {v.vendor}
                  </Typography.Text>
                  <Space size={4}>
                    <Tag>{v.systemCount} systems</Tag>
                    <Progress
                      percent={Math.min(100, v.riskScore)}
                      size="small"
                      showInfo={false}
                      strokeColor={v.riskScore >= 70 ? '#cf1322' : '#d46b08'}
                      style={{ width: 80 }}
                    />
                  </Space>
                </div>
              ))}
            </Space>
          )}
        </Card>
      </Col>

      <Col xs={24} md={10}>
        <Card size="small" title="Top Vendor Exposure" style={CARD_STYLE}>
          <Space direction="vertical" style={{ width: '100%' }}>
            {topVendors.slice(0, 6).map((v) => (
              <div key={v.vendor}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: 2,
                  }}
                >
                  <Typography.Text strong style={{ fontSize: 12 }}>
                    {v.vendor}
                  </Typography.Text>
                  <Tag
                    color={
                      v.riskScore >= 70
                        ? 'error'
                        : v.riskScore >= 40
                          ? 'warning'
                          : 'default'
                    }
                  >
                    {v.riskScore >= 70
                      ? 'HIGH'
                      : v.riskScore >= 40
                        ? 'MED'
                        : 'LOW'}
                  </Tag>
                </div>
                <Space size={12} style={{ paddingLeft: 4 }}>
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                    {v.systemCount} systems
                  </Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                    {v.processCount} processes
                  </Typography.Text>
                </Space>
              </div>
            ))}
          </Space>
        </Card>
      </Col>
    </Row>
  );
};

/* ---------- Row 6: SPOF Detector ---------- */
const Row6SpofDetector: React.FC<{
  snapshot: ArchitectureOverviewSnapshot;
  fragilitySnapshot: FragilityRiskSnapshot | null;
  onExploreSystem: (id: string) => void;
}> = ({ snapshot, fragilitySnapshot, onExploreSystem }) => {
  const centralityNodes: CentralityNode[] = snapshot.centralityNodes.slice(
    0,
    20,
  );
  const spofs = fragilitySnapshot?.spofCandidates.slice(0, 8) ?? [];

  return (
    <Row gutter={[12, 12]}>
      {/* Centrality bubble map */}
      <Col xs={24} md={14}>
        <Card
          size="small"
          title="Centrality Map — Node Size = Dependency Centrality"
          style={CARD_STYLE}
        >
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              padding: '4px 0',
              minHeight: 120,
              alignItems: 'flex-end',
            }}
          >
            {centralityNodes.map((node) => {
              const size = Math.max(28, Math.round(node.centrality * 80) + 24);
              const bg =
                node.riskLevel === 'critical'
                  ? '#cf1322'
                  : node.riskLevel === 'high'
                    ? '#d46b08'
                    : node.riskLevel === 'medium'
                      ? '#d4b106'
                      : '#389e0d';
              return (
                <Tooltip
                  key={node.id}
                  title={`${node.name} | ↑${node.inboundCount} ↓${node.outboundCount} | ${Math.round(node.centrality * 100)}% centrality`}
                >
                  <div
                    onClick={() => onExploreSystem(node.id)}
                    style={{
                      width: size,
                      height: size,
                      borderRadius: '50%',
                      background: bg,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      fontSize: Math.max(9, Math.round(size / 6)),
                      color: '#fff',
                      fontWeight: 600,
                      textAlign: 'center',
                      padding: 2,
                      overflow: 'hidden',
                      lineHeight: 1.1,
                      flexShrink: 0,
                    }}
                  >
                    {node.name.length > 10
                      ? `${node.name.slice(0, 8)}…`
                      : node.name}
                  </div>
                </Tooltip>
              );
            })}
            {centralityNodes.length === 0 && (
              <Empty
                description="No dependency data"
                style={{ margin: 'auto' }}
              />
            )}
          </div>
        </Card>
      </Col>

      {/* SPOF list */}
      <Col xs={24} md={10}>
        <Card size="small" title="SPOF Candidates" style={CARD_STYLE}>
          {spofs.length === 0 ? (
            <Empty description="No SPOFs detected" />
          ) : (
            <Space direction="vertical" style={{ width: '100%' }}>
              {spofs.map((spof) => (
                <div
                  key={spof.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                  }}
                  onClick={() => onExploreSystem(spof.id)}
                >
                  <Space size={4}>
                    {spof.isHardSpof && (
                      <Tag color="error" style={{ fontSize: 10 }}>
                        HARD
                      </Tag>
                    )}
                    <Typography.Text
                      ellipsis
                      style={{ maxWidth: 150, fontSize: 12 }}
                    >
                      {spof.name}
                    </Typography.Text>
                  </Space>
                  <Space size={4}>
                    <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                      ↑{spof.inboundCount}
                    </Typography.Text>
                    <Progress
                      percent={spof.fragilityScore}
                      size="small"
                      showInfo={false}
                      strokeColor={
                        spof.fragilityScore >= 70 ? '#cf1322' : '#d46b08'
                      }
                      style={{ width: 60 }}
                    />
                  </Space>
                </div>
              ))}
            </Space>
          )}
        </Card>
      </Col>
    </Row>
  );
};

/* ---------- Row 7: Capability Coverage Map ---------- */
const Row7CapabilityCoverage: React.FC<{
  snapshot: ArchitectureOverviewSnapshot;
}> = ({ snapshot }) => {
  const caps = snapshot.capabilityCoverage;

  const treemapData = {
    name: 'capabilities',
    children: caps.map((c) => ({
      name: c.name,
      value: Math.max(1, c.appCount + 1),
      supportLevel: c.supportLevel,
    })),
  };

  const supportColor = (level: 'green' | 'yellow' | 'red') =>
    level === 'green' ? '#52c41a' : level === 'yellow' ? '#faad14' : '#ff4d4f';

  return (
    <Card size="small" title="Capability Coverage Map" style={CARD_STYLE}>
      {caps.length === 0 ? (
        <Empty description="No capabilities defined" />
      ) : Treemap ? (
        <ErrorBoundary>
          <Treemap
            data={treemapData}
            colorField="supportLevel"
            height={240}
            color={({ supportLevel }: { supportLevel: string }) =>
              supportLevel === 'green'
                ? '#52c41a'
                : supportLevel === 'yellow'
                  ? '#faad14'
                  : '#ff4d4f'
            }
            label={{ formatter: (d: any) => d?.name ?? d?.data?.name ?? '' }}
          />
        </ErrorBoundary>
      ) : (
        <Row gutter={[8, 8]}>
          {caps.map((c) => (
            <Col span={4} key={c.id}>
              <Tooltip
                title={`${c.appCount} supporting apps${c.strategicImportance ? ` · ${c.strategicImportance}` : ''}`}
              >
                <Card
                  size="small"
                  style={{
                    background: `${supportColor(c.supportLevel)}22`,
                    borderColor: supportColor(c.supportLevel),
                    cursor: 'default',
                  }}
                >
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: supportColor(c.supportLevel),
                        flexShrink: 0,
                      }}
                    />
                    <Typography.Text ellipsis style={{ fontSize: 11 }}>
                      {c.name}
                    </Typography.Text>
                  </div>
                  <Typography.Text
                    type="secondary"
                    style={{ fontSize: 10, paddingLeft: 12 }}
                  >
                    {c.appCount} apps
                  </Typography.Text>
                </Card>
              </Tooltip>
            </Col>
          ))}
        </Row>
      )}

      <Space size={16} style={{ marginTop: 8 }}>
        {[
          { label: 'Well-supported (3+)', color: '#52c41a' },
          { label: 'Weak (1–2 apps)', color: '#faad14' },
          { label: 'No support', color: '#ff4d4f' },
        ].map(({ label, color }) => (
          <Space key={label} size={4}>
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: color,
                display: 'inline-block',
              }}
            />
            <Typography.Text style={{ fontSize: 11 }}>{label}</Typography.Text>
          </Space>
        ))}
      </Space>
    </Card>
  );
};

/* ---------- Row 8: Change Risk Timeline ---------- */
const Row8ChangeTimeline: React.FC<{
  snapshot: ArchitectureOverviewSnapshot;
}> = ({ snapshot }) => {
  const { changeRiskTimeline } = snapshot;

  if (changeRiskTimeline.length === 0) {
    return (
      <Card size="small" title="Change Risk Timeline" style={CARD_STYLE}>
        <Empty description="No modification timestamps found in repository" />
      </Card>
    );
  }

  return (
    <Card
      size="small"
      title="Change Risk Timeline — Last 30 Data Points"
      style={CARD_STYLE}
    >
      {Area ? (
        <ErrorBoundary>
          <Area
            data={changeRiskTimeline}
            xField="date"
            yField="riskScore"
            height={180}
            smooth
            color="#d46b08"
            areaStyle={{ fill: 'l(270) 0:#d46b0822 1:#d46b08' }}
            tooltip={{
              formatter: (d: any) => ({
                name: 'Risk Score',
                value: `${d.riskScore} (${d.changeCount} changes)`,
              }),
            }}
          />
        </ErrorBoundary>
      ) : (
        <Space direction="vertical" style={{ width: '100%' }}>
          {changeRiskTimeline.slice(-10).map((entry) => (
            <div
              key={entry.date}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                {entry.date}
              </Typography.Text>
              <Space size={8}>
                <Typography.Text style={{ fontSize: 11 }}>
                  {entry.changeCount} changes
                </Typography.Text>
                <Progress
                  percent={entry.riskScore}
                  size="small"
                  showInfo={false}
                  strokeColor="#d46b08"
                  style={{ width: 80 }}
                />
              </Space>
            </div>
          ))}
        </Space>
      )}
    </Card>
  );
};

/* ---------- Row 9: Mini Live Architecture Map (Cytoscape) ---------- */
const Row9MiniArchMap: React.FC<{ snapshot: ArchitectureOverviewSnapshot }> = ({
  snapshot,
}) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const cyRef = React.useRef<any>(null);

  React.useEffect(() => {
    if (!containerRef.current) return;

    let cytoscape: any;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      cytoscape = require('cytoscape');
      cytoscape = cytoscape.default ?? cytoscape;
    } catch {
      return;
    }

    const centralityNodes = snapshot.centralityNodes.slice(0, 40);
    const _nodeIds = new Set(centralityNodes.map((n) => n.id));

    // Build edges from the top 40 centrality nodes only
    const elements: any[] = [
      ...centralityNodes.map((node) => ({
        group: 'nodes',
        data: {
          id: node.id,
          label:
            node.name.length > 14 ? `${node.name.slice(0, 12)}…` : node.name,
          centrality: node.centrality,
          risk: node.riskLevel,
        },
      })),
    ];

    // We don't have edges in the overview snapshot directly; use centrality nodes
    // as positional proxies. Real edges come from the full impact snapshot if needed.
    // For the mini-map we produce a ring + hub layout.

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            label: 'data(label)',
            'font-size': 9,
            'text-valign': 'bottom',
            'text-halign': 'center',
            'text-margin-y': 3,
            'background-color': (ele: any) => {
              const r = ele.data('risk');
              return r === 'critical'
                ? '#cf1322'
                : r === 'high'
                  ? '#d46b08'
                  : r === 'medium'
                    ? '#d4b106'
                    : '#389e0d';
            },
            width: (ele: any) => Math.max(16, ele.data('centrality') * 50 + 10),
            height: (ele: any) =>
              Math.max(16, ele.data('centrality') * 50 + 10),
            color: '#ccc',
            'text-background-color': 'transparent',
          },
        },
      ],
      layout: { name: 'concentric', levelWidth: () => 1, minNodeSpacing: 16 },
      userZoomingEnabled: false,
      userPanningEnabled: false,
      boxSelectionEnabled: false,
      autoungrabify: true,
    });

    cyRef.current = cy;
    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [snapshot]);

  return (
    <Card size="small" title="Architecture Topology Minimap" style={CARD_STYLE}>
      <div ref={containerRef} style={{ width: '100%', height: 240 }} />
      <Typography.Text type="secondary" style={{ fontSize: 11 }}>
        Node size = centrality · Color = risk level · Read-only snapshot
      </Typography.Text>
    </Card>
  );
};

/* ========== Main Page Component ========== */
const ArchitectureIntelligenceDashboard: React.FC = () => {
  const { eaRepository } = useEaRepository();
  const { openWorkspaceTab } = useIdeShell();

  /* ---- Compute snapshots ---- */
  const overviewSnapshot =
    React.useMemo<ArchitectureOverviewSnapshot | null>(() => {
      if (!eaRepository) return null;
      try {
        return getArchitectureOverviewSnapshot(eaRepository);
      } catch {
        return null;
      }
    }, [eaRepository]);

  const impactSnapshot = React.useMemo(() => {
    if (!eaRepository) return null;
    try {
      return getImpactAnalysisSnapshot(eaRepository);
    } catch {
      return null;
    }
  }, [eaRepository]);

  const fragilitySnapshot = React.useMemo<FragilityRiskSnapshot | null>(() => {
    if (!eaRepository) return null;
    try {
      return computeFragilityRiskSnapshot(impactSnapshot, eaRepository);
    } catch {
      return null;
    }
  }, [eaRepository, impactSnapshot]);

  /* ---- Precompute in background on mount ---- */
  React.useEffect(() => {
    if (!eaRepository) return;
    precomputeArchitectureOverviewInBackground(eaRepository);
  }, [eaRepository]);

  /* ---- Subscribe to repository changes ---- */
  const [_tick, setTick] = React.useState(0);
  React.useEffect(() => {
    const handler = () => setTick((t) => t + 1);
    window.addEventListener('ea:repositoryChanged', handler);
    window.addEventListener('ea:relationshipsChanged', handler);
    return () => {
      window.removeEventListener('ea:repositoryChanged', handler);
      window.removeEventListener('ea:relationshipsChanged', handler);
    };
  }, []);

  /* ---- Navigation helpers ---- */
  const openImpactAnalysis = React.useCallback(() => {
    openWorkspaceTab({ type: 'analysis', kind: 'impact' });
  }, [openWorkspaceTab]);

  const openDependencyExplorer = React.useCallback(
    (systemId: string) => {
      openWorkspaceTab({ type: 'analysis', kind: 'impact' });
      if (systemId) {
        window.dispatchEvent(
          new CustomEvent('ea:analysis.impact.focus', {
            detail: { systemId, section: 'explorer' },
          }),
        );
      }
    },
    [openWorkspaceTab],
  );

  const openSpofSection = React.useCallback(() => {
    openWorkspaceTab({ type: 'analysis', kind: 'impact' });
    dispatchImpactAnalysisSection('fragility');
  }, [openWorkspaceTab]);

  /* ---- Loading state ---- */
  if (!eaRepository) {
    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <Spin size="large" />
        <Typography.Text type="secondary">Loading repository…</Typography.Text>
      </div>
    );
  }

  if (!overviewSnapshot) {
    return (
      <div style={{ padding: 24 }}>
        <Alert
          type="warning"
          showIcon
          message="No data available"
          description="Load or create an EA repository to see the Architecture Intelligence Dashboard."
        />
      </div>
    );
  }

  /* ---- Rendered dashboard ---- */
  return (
    <div
      style={{
        padding: '12px 16px',
        overflowY: 'auto',
        height: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Page header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <Space align="center">
          <RadarChartOutlined style={{ fontSize: 20, color: '#1677ff' }} />
          <Typography.Title level={4} style={{ margin: 0 }}>
            Architecture Intelligence
          </Typography.Title>
          <Tag color="blue">
            {overviewSnapshot.totalSystemCount} systems · fingerprint{' '}
            {overviewSnapshot.fingerprint}
          </Tag>
        </Space>
        <Space>
          <Button
            type="default"
            icon={<ClusterOutlined />}
            onClick={openSpofSection}
            size="small"
          >
            Fragility Scanner
          </Button>
          <Button
            type="primary"
            icon={<DashboardOutlined />}
            onClick={openImpactAnalysis}
            size="small"
          >
            Full Impact Analysis
          </Button>
        </Space>
      </div>

      {/* ROW 1 — Executive status bar */}
      <Row1ExecutiveBar
        snapshot={overviewSnapshot}
        fragilitySnapshot={fragilitySnapshot}
        onOpenImpact={openImpactAnalysis}
      />

      <Divider style={{ margin: '12px 0' }} />

      {/* ROW 2 — Risk distribution charts */}
      <Row2RiskDistribution snapshot={overviewSnapshot} />

      <Divider style={{ margin: '12px 0' }} />

      {/* ROW 3 — Operational risk heatmap */}
      <Row3ProcessHeatmap snapshot={overviewSnapshot} />

      <Divider style={{ margin: '12px 0' }} />

      {/* ROW 4 — Infrastructure concentration */}
      <Row4Infrastructure snapshot={overviewSnapshot} />

      <Divider style={{ margin: '12px 0' }} />

      {/* ROW 5 — Vendor risk network */}
      <Row5VendorRisk snapshot={overviewSnapshot} />

      <Divider style={{ margin: '12px 0' }} />

      {/* ROW 6 — SPOF detector */}
      <Row6SpofDetector
        snapshot={overviewSnapshot}
        fragilitySnapshot={fragilitySnapshot}
        onExploreSystem={openDependencyExplorer}
      />

      <Divider style={{ margin: '12px 0' }} />

      {/* ROW 7 — Capability coverage map */}
      <Row7CapabilityCoverage snapshot={overviewSnapshot} />

      <Divider style={{ margin: '12px 0' }} />

      {/* ROW 8 — Change risk timeline */}
      <Row8ChangeTimeline snapshot={overviewSnapshot} />

      <Divider style={{ margin: '12px 0' }} />

      {/* ROW 9 — Mini live architecture map */}
      <Row9MiniArchMap snapshot={overviewSnapshot} />

      {/* Bottom spacer */}
      <div style={{ height: 24 }} />
    </div>
  );
};

export default ArchitectureIntelligenceDashboard;
