import {
  CheckCircleOutlined,
  CloudDownloadOutlined,
  ClusterOutlined,
  DashboardOutlined,
  DesktopOutlined,
  InfoCircleOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  WindowsOutlined,
} from '@ant-design/icons';
import {
  Badge,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  List,
  message,
  Progress,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import React from 'react';
import { getMachinesWithStatus } from '@/services/ea/liveInventory';
import type { MachineInventory } from '../../../backend/modules/live-inventory/liveInventory.types';

const API_BASE = 'http://localhost:3001';

const AgentManagementPage: React.FC = () => {
  const [downloading, setDownloading] = React.useState(false);
  const [machines, setMachines] = React.useState<MachineInventory[]>([]);
  const [loading, setLoading] = React.useState(false);

  const fetchMachines = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await getMachinesWithStatus();
      if (res?.success) setMachines(res.data ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchMachines();
    const id = setInterval(fetchMachines, 15_000);
    return () => clearInterval(id);
  }, [fetchMachines]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const response = await fetch(
        `${API_BASE}/api/agent/download/windows?t=${Date.now()}`,
      );
      if (!response.ok) {
        let errorMessage = `Download failed (HTTP ${response.status})`;
        try {
          const body = (await response.json()) as { errorMessage?: string };
          if (body?.errorMessage) errorMessage = body.errorMessage;
        } catch {
          // no-op
        }
        throw new Error(errorMessage);
      }

      const blob = await response.blob();
      const contentDisposition =
        response.headers.get('content-disposition') ?? '';
      const nameMatch = /filename\s*=\s*"?([^";]+)"?/i.exec(contentDisposition);
      const fileName = nameMatch?.[1] ?? 'RedlyAgentSetup.exe';

      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);

      message.success('Download started');
    } catch (error) {
      const text =
        error instanceof Error
          ? error.message
          : 'Failed to download agent installer';
      message.error(text);
    } finally {
      setDownloading(false);
    }
  };

  const onlineCount = machines.filter((m: any) => m.status === 'online').length;
  const offlineCount = machines.length - onlineCount;
  const totalApps = machines.reduce(
    (s, m) => s + (m.installedApps?.length ?? 0),
    0,
  );
  const totalServices = machines.reduce(
    (s, m) => s + (m.services?.length ?? 0),
    0,
  );

  return (
    <div style={{ padding: 24, height: '100%', overflow: 'auto' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 24,
        }}
      >
        <Typography.Title level={3} style={{ margin: 0 }}>
          <ClusterOutlined style={{ marginRight: 8 }} />
          Agent Management
        </Typography.Title>
        <Space>
          <Button
            icon={<ReloadOutlined />}
            onClick={fetchMachines}
            loading={loading}
          >
            Refresh
          </Button>
          <Button
            type="primary"
            icon={<CloudDownloadOutlined />}
            loading={downloading}
            onClick={handleDownload}
          >
            Download Agent Installer
          </Button>
        </Space>
      </div>

      {/* ── Fleet Overview ── */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="Total Endpoints"
              value={machines.length}
              prefix={<DesktopOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="Online"
              value={onlineCount}
              valueStyle={{ color: '#52c41a' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="Offline"
              value={offlineCount}
              valueStyle={{ color: offlineCount > 0 ? '#ff4d4f' : '#999' }}
              prefix={<InfoCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="Total Software"
              value={totalApps}
              prefix={<DashboardOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        {/* ── Endpoint Fleet Table ── */}
        <Col xs={24} lg={16}>
          <Card
            title="Managed Endpoints"
            size="small"
            extra={<Tag color="blue">{machines.length} endpoint(s)</Tag>}
          >
            {machines.length === 0 ? (
              <Empty description="No agents reporting yet. Download and install the agent on target machines." />
            ) : (
              <Table
                size="small"
                dataSource={machines}
                rowKey={(r: MachineInventory) => r.hostname}
                pagination={false}
                columns={[
                  {
                    title: 'Status',
                    key: 'status',
                    width: 80,
                    render: (_: unknown, r: any) => (
                      <Badge
                        status={r.status === 'online' ? 'success' : 'default'}
                        text={r.status === 'online' ? 'Online' : 'Offline'}
                      />
                    ),
                  },
                  {
                    title: 'Hostname',
                    dataIndex: 'hostname',
                    key: 'hostname',
                    render: (v: string) => (
                      <Typography.Link href={`/live-inventory`}>
                        {v}
                      </Typography.Link>
                    ),
                  },
                  { title: 'OS', dataIndex: 'os', key: 'os', ellipsis: true },
                  {
                    title: 'Apps',
                    key: 'apps',
                    width: 70,
                    render: (_: unknown, r: MachineInventory) =>
                      r.installedApps?.length ?? 0,
                  },
                  {
                    title: 'Services',
                    key: 'svcs',
                    width: 80,
                    render: (_: unknown, r: MachineInventory) =>
                      r.services?.length ?? 0,
                  },
                  {
                    title: 'Patches',
                    key: 'patches',
                    width: 80,
                    render: (_: unknown, r: MachineInventory) =>
                      (r as any).patches?.length ?? 0,
                  },
                  {
                    title: 'Security',
                    key: 'security',
                    width: 100,
                    render: (_: unknown, r: MachineInventory) => {
                      const sec = (r as any).securityStatus;
                      if (!sec) return <Tag>N/A</Tag>;
                      const fwOk = sec.firewall?.every((f: any) => f.Enabled);
                      const defOk = sec.defender?.realTimeProtection;
                      if (fwOk && defOk)
                        return (
                          <Tag color="green">
                            <SafetyCertificateOutlined /> OK
                          </Tag>
                        );
                      return (
                        <Tag color="red">
                          <SafetyCertificateOutlined /> Issues
                        </Tag>
                      );
                    },
                  },
                  {
                    title: 'Last Seen',
                    dataIndex: 'lastSeen',
                    key: 'lastSeen',
                    width: 160,
                    render: (v: string) =>
                      v ? new Date(v).toLocaleString() : '—',
                  },
                ]}
              />
            )}
          </Card>
        </Col>

        {/* ── Agent Info Panel ── */}
        <Col xs={24} lg={8}>
          <Card
            title={
              <span>
                <WindowsOutlined style={{ marginRight: 8 }} />
                Agent Installer
              </span>
            }
            size="small"
            style={{ marginBottom: 16 }}
          >
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Agent Version">3.0.0</Descriptions.Item>
              <Descriptions.Item label="Architecture">
                x64 (node.exe bundled)
              </Descriptions.Item>
              <Descriptions.Item label="Install Type">
                Windows Service (auto-start)
              </Descriptions.Item>
              <Descriptions.Item label="Collectors">
                12 native modules
              </Descriptions.Item>
              <Descriptions.Item label="Commands">
                16 remote actions
              </Descriptions.Item>
              <Descriptions.Item label="Policy Engine">
                Local enforcement
              </Descriptions.Item>
              <Descriptions.Item label="osquery">
                Not required
              </Descriptions.Item>
            </Descriptions>
            <Button
              type="primary"
              icon={<CloudDownloadOutlined />}
              block
              style={{ marginTop: 12 }}
              loading={downloading}
              onClick={handleDownload}
            >
              Download Windows Agent
            </Button>
            <Typography.Text
              type="secondary"
              style={{ display: 'block', marginTop: 8, fontSize: 11 }}
            >
              The installer is code-signed with a development certificate. On
              first download, Windows SmartScreen may show a warning — click
              "More info" then "Run anyway".
            </Typography.Text>
          </Card>

          <Card title="Agent Capabilities" size="small">
            <List
              size="small"
              split={false}
              dataSource={[
                {
                  icon: <DashboardOutlined />,
                  text: 'Installed software inventory',
                },
                {
                  icon: <DashboardOutlined />,
                  text: 'Running processes & memory',
                },
                {
                  icon: <DashboardOutlined />,
                  text: 'Windows services management',
                },
                {
                  icon: <DashboardOutlined />,
                  text: 'Network interfaces & ports',
                },
                { icon: <DashboardOutlined />, text: 'Disk drives & usage' },
                { icon: <DashboardOutlined />, text: 'Logged-in users' },
                { icon: <DashboardOutlined />, text: 'Startup programs' },
                {
                  icon: <DashboardOutlined />,
                  text: 'Windows patches / hotfixes',
                },
                {
                  icon: <SafetyCertificateOutlined />,
                  text: 'Security posture (firewall, AV, BitLocker, UAC)',
                },
                {
                  icon: <SafetyCertificateOutlined />,
                  text: 'Policy enforcement engine',
                },
                {
                  icon: <DesktopOutlined />,
                  text: 'Remote commands & process control',
                },
                {
                  icon: <DesktopOutlined />,
                  text: 'Machine lock / restart / shutdown',
                },
              ]}
              renderItem={(item) => (
                <List.Item style={{ padding: '4px 0' }}>
                  <Space size={8}>
                    <span style={{ color: '#1677ff' }}>{item.icon}</span>
                    <Typography.Text style={{ fontSize: 13 }}>
                      {item.text}
                    </Typography.Text>
                  </Space>
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default AgentManagementPage;
