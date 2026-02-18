/**
 * FragilityRiskPanel
 *
 * Displayed inside the Impact Analysis tab when the "Fragility" section is selected.
 * Shows SPOF candidates, high-debt systems, and vendor lock-in.
 */
import React from 'react';
import {
  Badge,
  Card,
  Col,
  List,
  Progress,
  Row,
  Space,
  Statistic,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  AlertOutlined,
  BugOutlined,
  LinkOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import ErrorBoundary from '@/components/ErrorBoundary';
import type { FragilityRiskSnapshot } from '@/analysis/fragilityRiskEngine';

/* ---------- Safe chart imports ---------- */
let Bar: React.ComponentType<any> | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const charts = require('@ant-design/charts');
  Bar = charts.Bar ?? null;
} catch {
  /* unavailable in test env */
}

/* ---------- Props ---------- */
type Props = {
  snapshot: FragilityRiskSnapshot;
  selectedSystemId?: string;
  onSelectSystem: (systemId: string) => void;
  onOpenDiagram: (systemId: string, elementType: string) => void;
  onOpenDependencyExplorer: (systemId: string) => void;
};

/* ---------- Helpers ---------- */
const debtColor = (d: string) =>
  d === 'High' ? '#cf1322' : d === 'Medium' ? '#d46b08' : d === 'Low' ? '#389e0d' : '#8c8c8c';

const spofLevelColor = (crit: 'high' | 'medium' | 'low') =>
  crit === 'high' ? '#cf1322' : crit === 'medium' ? '#d46b08' : '#8c8c8c';

/* ---------- Component ---------- */
export default function FragilityRiskPanel({
  snapshot,
  selectedSystemId,
  onSelectSystem,
  onOpenDependencyExplorer,
}: Props) {
  const {
    aggregateFragilityScore,
    spofCandidates,
    fragileSystems,
    vendorLockIn,
    cycleParticipantCount,
    brokenRelationshipCount,
  } = snapshot;

  const fragilityColor =
    aggregateFragilityScore >= 70
      ? '#cf1322'
      : aggregateFragilityScore >= 40
      ? '#d46b08'
      : '#52c41a';

  const vendorBarData = vendorLockIn
    .slice(0, 8)
    .map((v) => ({ vendor: v.vendor, lockIn: v.lockInScore }));

  return (
    <div style={{ padding: '8px 0' }}>
      {/* Headline KPIs */}
      <Row gutter={[12, 12]}>
        <Col span={5}>
          <Card size="small" style={{ textAlign: 'center' }}>
            <Progress
              type="dashboard"
              percent={aggregateFragilityScore}
              strokeColor={fragilityColor}
              format={(p) => (
                <span style={{ fontSize: 18, fontWeight: 700, color: fragilityColor }}>
                  {p}
                </span>
              )}
            />
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              Fragility Score
            </Typography.Text>
          </Card>
        </Col>
        <Col span={19}>
          <Row gutter={[8, 8]}>
            {[
              {
                title: 'SPOF Candidates',
                value: spofCandidates.length,
                icon: <AlertOutlined />,
                color: spofCandidates.length > 0 ? '#cf1322' : '#52c41a',
              },
              {
                title: 'Hard SPOFs',
                value: spofCandidates.filter((s) => s.isHardSpof).length,
                icon: <WarningOutlined />,
                color: '#cf1322',
              },
              {
                title: 'High-Debt Systems',
                value: fragileSystems.filter((s) => s.technicalDebt === 'High').length,
                icon: <BugOutlined />,
                color: '#d46b08',
              },
              {
                title: 'Cycle Participants',
                value: cycleParticipantCount,
                icon: <LinkOutlined />,
                color: cycleParticipantCount > 0 ? '#d46b08' : '#52c41a',
              },
              {
                title: 'Broken Refs',
                value: brokenRelationshipCount,
                icon: <WarningOutlined />,
                color: brokenRelationshipCount > 0 ? '#d46b08' : '#52c41a',
              },
            ].map((kpi) => (
              <Col span={4} key={kpi.title}>
                <Card size="small" style={{ textAlign: 'center' }}>
                  <Statistic
                    title={kpi.title}
                    value={kpi.value}
                    prefix={kpi.icon}
                    valueStyle={{ color: kpi.color }}
                  />
                </Card>
              </Col>
            ))}
          </Row>
        </Col>
      </Row>

      {/* SPOF candidates */}
      <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
        <Col span={12}>
          <Card size="small" title="SPOF Candidates — Top 10">
            <List
              size="small"
              dataSource={spofCandidates.slice(0, 10)}
              renderItem={(spof) => (
                <List.Item
                  key={spof.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => onSelectSystem(spof.id)}
                  className={spof.id === selectedSystemId ? 'ant-list-item-selected' : ''}
                  actions={[
                    <Tooltip title="Explore dependencies" key="explore">
                      <Typography.Link
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenDependencyExplorer(spof.id);
                        }}
                      >
                        Explore
                      </Typography.Link>
                    </Tooltip>,
                  ]}
                >
                  <List.Item.Meta
                    title={
                      <Space size={4}>
                        {spof.isHardSpof && <Tag color="error">HARD SPOF</Tag>}
                        <Typography.Text strong>{spof.name}</Typography.Text>
                      </Space>
                    }
                    description={
                      <Space size={4} wrap>
                        <Badge
                          color={spofLevelColor(spof.dependantCriticality)}
                          text={`${spof.dependantCriticality} criticality`}
                        />
                        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                          ↑{spof.inboundCount} ↓{spof.outboundCount}
                        </Typography.Text>
                      </Space>
                    }
                  />
                  <Progress
                    percent={spof.fragilityScore}
                    size="small"
                    showInfo={false}
                    strokeColor={spof.fragilityScore >= 70 ? '#cf1322' : '#d46b08'}
                    style={{ width: 80 }}
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>

        <Col span={12}>
          <Card size="small" title="High-Fragility Systems">
            <List
              size="small"
              dataSource={fragileSystems.slice(0, 10)}
              renderItem={(sys) => (
                <List.Item
                  key={sys.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => onSelectSystem(sys.id)}
                >
                  <List.Item.Meta
                    title={<Typography.Text strong>{sys.name}</Typography.Text>}
                    description={
                      <Space size={4} wrap>
                        <Tag color={debtColor(sys.technicalDebt)} style={{ fontSize: 11 }}>
                          Debt: {sys.technicalDebt}
                        </Tag>
                        <Tag
                          color={debtColor(sys.vendorLockIn)}
                          style={{ fontSize: 11 }}
                        >
                          Lock-in: {sys.vendorLockIn}
                        </Tag>
                        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                          ↓{sys.downstreamCount} deps
                        </Typography.Text>
                      </Space>
                    }
                  />
                  <Progress
                    percent={sys.fragilityScore}
                    size="small"
                    showInfo={false}
                    strokeColor={debtColor(sys.technicalDebt)}
                    style={{ width: 80 }}
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>

      {/* Vendor lock-in bar chart */}
      {vendorLockIn.length > 0 && (
        <Card size="small" title="Vendor Lock-in Concentration" style={{ marginTop: 12 }}>
          {Bar && vendorBarData.length > 0 ? (
            <ErrorBoundary>
              <Bar
                data={vendorBarData}
                xField="lockIn"
                yField="vendor"
                height={180}
                color={({ vendor }: { vendor: string }) => {
                  const entry = vendorLockIn.find((v) => v.vendor === vendor);
                  if (!entry) return '#1677ff';
                  return entry.lockInScore >= 70
                    ? '#cf1322'
                    : entry.lockInScore >= 40
                    ? '#d46b08'
                    : '#52c41a';
                }}
                label={{ position: 'right' }}
              />
            </ErrorBoundary>
          ) : (
            <List
              size="small"
              dataSource={vendorLockIn.slice(0, 8)}
              renderItem={(v) => (
                <List.Item key={v.vendor}>
                  <List.Item.Meta
                    title={v.vendor}
                    description={`${v.systemCount} systems · ${v.processCount} processes`}
                  />
                  <Progress
                    percent={v.lockInScore}
                    size="small"
                    strokeColor={
                      v.lockInScore >= 70 ? '#cf1322' : v.lockInScore >= 40 ? '#d46b08' : '#52c41a'
                    }
                    style={{ width: 120 }}
                  />
                </List.Item>
              )}
            />
          )}
        </Card>
      )}
    </div>
  );
}
