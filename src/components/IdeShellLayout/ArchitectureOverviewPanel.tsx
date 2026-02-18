/**
 * ArchitectureOverviewPanel
 *
 * Displayed inside the Impact Analysis tab when the "Overview" section is selected.
 * Shows high-level architecture health KPIs and distribution charts.
 */
import React from 'react';
import {
  Badge,
  Card,
  Col,
  Progress,
  Row,
  Space,
  Statistic,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  ApartmentOutlined,
  BulbOutlined,
  ExclamationCircleOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import ErrorBoundary from '@/components/ErrorBoundary';
import type { ArchitectureOverviewSnapshot } from '@/analysis/architectureOverviewEngine';
import type { ImpactAnalysisSnapshot } from '@/analysis/impactDependencyEngine';

/* ---------- Safe chart imports ---------- */
let Pie: React.ComponentType<any> | null = null;
let Column: React.ComponentType<any> | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const charts = require('@ant-design/charts');
  Pie = charts.Pie ?? null;
  Column = charts.Column ?? null;
} catch {
  /* charts unavailable in test env */
}

/* ---------- Props ---------- */
type Props = {
  snapshot: ArchitectureOverviewSnapshot;
  impactSnapshot: ImpactAnalysisSnapshot | null;
  onOpenDependencyExplorer: (systemId: string) => void;
  onNavigateToDiagram: (systemId: string, elementType: string) => void;
};

/* ---------- Helpers ---------- */
const RISK_COLORS: Record<string, string> = {
  Critical: '#cf1322',
  High: '#d46b08',
  Medium: '#d4b106',
  Healthy: '#389e0d',
};

const healthColor = (score: number) =>
  score >= 80 ? '#52c41a' : score >= 60 ? '#faad14' : '#ff4d4f';

/* ---------- Component ---------- */
export default function ArchitectureOverviewPanel({
  snapshot,
  onOpenDependencyExplorer,
}: Props) {
  const {
    healthScore,
    criticalSystemCount,
    highRiskSystemCount,
    unownedSystemCount,
    businessCriticalProcessCount,
    externalVendorCount,
    totalSystemCount,
    riskDistribution,
    dependencyLoadDistribution,
    ownershipCoverage,
    environmentDistribution,
    centralityNodes,
  } = snapshot;

  const pieConfig = (data: { type: string; value: number }[]) => ({
    data,
    angleField: 'value',
    colorField: 'type',
    radius: 0.85,
    legend: { position: 'right' as const },
    interactions: [{ type: 'element-active' }],
    label: { type: 'inner', offset: '-30%', style: { fontSize: 12 } },
    height: 200,
  });

  const riskPieData = riskDistribution
    .filter((d) => d.count > 0)
    .map((d) => ({ type: d.bucket, value: d.count }));

  const ownershipPieData = ownershipCoverage.map((d) => ({ type: d.label, value: d.count }));

  const envColData = environmentDistribution.map((d) => ({ type: d.env, value: d.count }));

  const depColData = dependencyLoadDistribution.map((d) => ({ type: d.range, value: d.count }));

  const TOP_SPOF = centralityNodes.slice(0, 5);

  return (
    <div style={{ padding: '8px 0' }}>
      {/* Health score + KPI bar */}
      <Row gutter={[12, 12]} align="middle">
        <Col span={4}>
          <Card size="small" style={{ textAlign: 'center' }}>
            <Progress
              type="dashboard"
              percent={healthScore}
              strokeColor={healthColor(healthScore)}
              format={(p) => (
                <span style={{ fontSize: 18, fontWeight: 700, color: healthColor(p ?? 0) }}>
                  {p}
                </span>
              )}
            />
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              Health Score
            </Typography.Text>
          </Card>
        </Col>
        <Col span={20}>
          <Row gutter={[8, 8]}>
            {[
              {
                title: 'Total Systems',
                value: totalSystemCount,
                icon: <ApartmentOutlined />,
                color: undefined,
              },
              {
                title: 'Critical',
                value: criticalSystemCount,
                icon: <ExclamationCircleOutlined />,
                color: '#cf1322',
              },
              {
                title: 'High Risk',
                value: highRiskSystemCount,
                icon: <WarningOutlined />,
                color: '#d46b08',
              },
              {
                title: 'Unowned',
                value: unownedSystemCount,
                icon: <TeamOutlined />,
                color: unownedSystemCount > 0 ? '#d46b08' : '#52c41a',
              },
              {
                title: 'Critical Processes',
                value: businessCriticalProcessCount,
                icon: <BulbOutlined />,
                color: undefined,
              },
              {
                title: 'Ext. Vendors',
                value: externalVendorCount,
                icon: <SafetyCertificateOutlined />,
                color: externalVendorCount > 5 ? '#d46b08' : undefined,
              },
            ].map((kpi) => (
              <Col span={4} key={kpi.title}>
                <Card size="small" style={{ textAlign: 'center' }}>
                  <Statistic
                    title={kpi.title}
                    value={kpi.value}
                    prefix={kpi.icon}
                    valueStyle={kpi.color ? { color: kpi.color } : undefined}
                  />
                </Card>
              </Col>
            ))}
          </Row>
        </Col>
      </Row>

      {/* Distribution charts */}
      <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
        <Col span={6}>
          <Card size="small" title="Risk Distribution">
            {Pie && riskPieData.length > 0 ? (
              <ErrorBoundary>
                <Pie
                  {...pieConfig(riskPieData)}
                  color={({ type }: { type: string }) => RISK_COLORS[type] ?? '#1677ff'}
                />
              </ErrorBoundary>
            ) : (
              <Space direction="vertical" style={{ width: '100%' }}>
                {riskDistribution.map((d) => (
                  <div key={d.bucket} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Badge color={RISK_COLORS[d.bucket]} text={d.bucket} />
                    <Typography.Text strong>{d.count}</Typography.Text>
                  </div>
                ))}
              </Space>
            )}
          </Card>
        </Col>

        <Col span={6}>
          <Card size="small" title="Ownership Coverage">
            {Pie && ownershipPieData.some((d) => d.value > 0) ? (
              <ErrorBoundary>
                <Pie
                  {...pieConfig(ownershipPieData)}
                  color={({ type }: { type: string }) =>
                    type === 'Owned' ? '#52c41a' : '#ff4d4f'
                  }
                />
              </ErrorBoundary>
            ) : (
              <Space direction="vertical" style={{ width: '100%' }}>
                {ownershipCoverage.map((d) => (
                  <div key={d.label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Badge color={d.label === 'Owned' ? '#52c41a' : '#ff4d4f'} text={d.label} />
                    <Typography.Text strong>{d.count}</Typography.Text>
                  </div>
                ))}
              </Space>
            )}
          </Card>
        </Col>

        <Col span={6}>
          <Card size="small" title="Dependency Load">
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
              <Space direction="vertical" style={{ width: '100%' }}>
                {dependencyLoadDistribution.map((d) => (
                  <div key={d.range} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography.Text>{d.range}</Typography.Text>
                    <Typography.Text strong>{d.count}</Typography.Text>
                  </div>
                ))}
              </Space>
            )}
          </Card>
        </Col>

        <Col span={6}>
          <Card size="small" title="Environment Distribution">
            {Column && envColData.length > 0 ? (
              <ErrorBoundary>
                <Column
                  data={envColData}
                  xField="type"
                  yField="value"
                  height={200}
                  color="#722ed1"
                  label={{ position: 'top' }}
                />
              </ErrorBoundary>
            ) : (
              <Space direction="vertical" style={{ width: '100%' }}>
                {environmentDistribution.map((d) => (
                  <div key={d.env} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography.Text>{d.env}</Typography.Text>
                    <Typography.Text strong>{d.count}</Typography.Text>
                  </div>
                ))}
              </Space>
            )}
          </Card>
        </Col>
      </Row>

      {/* SPOF preview */}
      {TOP_SPOF.length > 0 && (
        <Card size="small" title="Top Centrality Nodes (SPOF Risk)" style={{ marginTop: 12 }}>
          <Row gutter={[8, 8]}>
            {TOP_SPOF.map((node) => (
              <Col span={4} key={node.id}>
                <Tooltip title={`In: ${node.inboundCount}  Out: ${node.outboundCount}`}>
                  <Card
                    size="small"
                    hoverable
                    onClick={() => onOpenDependencyExplorer(node.id)}
                    style={{ cursor: 'pointer', textAlign: 'center' }}
                  >
                    <Tag
                      color={
                        node.riskLevel === 'critical'
                          ? 'error'
                          : node.riskLevel === 'high'
                          ? 'warning'
                          : 'default'
                      }
                    >
                      {node.riskLevel.toUpperCase()}
                    </Tag>
                    <Typography.Text ellipsis style={{ display: 'block', marginTop: 4 }}>
                      {node.name}
                    </Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                      {Math.round(node.centrality * 100)}% centrality
                    </Typography.Text>
                  </Card>
                </Tooltip>
              </Col>
            ))}
          </Row>
        </Card>
      )}
    </div>
  );
}
