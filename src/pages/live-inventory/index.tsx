import {
  CloudSyncOutlined,
  CodeOutlined,
  DeleteOutlined,
  DesktopOutlined,
  LockOutlined,
  PoweroffOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  StopOutlined,
  ThunderboltOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import {
  Badge,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Input,
  List,
  Modal,
  Progress,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import React from 'react';
import {
  getInventoryMachineDetail,
  getMachinesWithStatus,
  queueAgentCommand,
} from '@/services/ea/liveInventory';
import type {
  DiskDrive,
  InstalledApp,
  ListeningPort,
  LoggedInUser,
  MachineInventory,
  NetworkInterface,
  ProcessUsageEntry,
  RunningProcess,
  WindowsService,
  StartupProgram,
  WindowsPatch,
  SecurityStatus,
} from '../../../backend/modules/live-inventory/liveInventory.types';

const POLL_INTERVAL_MS = 10_000;

/* ── Helpers ── */
const fmtBytes = (v: string | number | undefined) => {
  const n = Number(v);
  if (!n || isNaN(n)) return '—';
  if (n > 1024 ** 4) return `${(n / 1024 ** 4).toFixed(1)} TB`;
  if (n > 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n > 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024).toFixed(0)} KB`;
};

const LiveInventoryPage: React.FC = () => {
  const [machines, setMachines] = React.useState<MachineInventory[]>([]);
  const [selected, setSelected] = React.useState<MachineInventory | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [detailLoading, setDetailLoading] = React.useState(false);

  // ── Machine Actions state ──
  const [killModalOpen, setKillModalOpen] = React.useState(false);
  const [killProcessName, setKillProcessName] = React.useState('');
  const [runModalOpen, setRunModalOpen] = React.useState(false);
  const [runCmdText, setRunCmdText] = React.useState('');
  const [serviceModalOpen, setServiceModalOpen] = React.useState(false);
  const [serviceActionName, setServiceActionName] = React.useState('');
  const [serviceActionType, setServiceActionType] = React.useState<'restart_service' | 'stop_service' | 'start_service'>('restart_service');
  const [actionLoading, setActionLoading] = React.useState(false);
  const [searchText, setSearchText] = React.useState('');

  const fetchMachines = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await getMachinesWithStatus();
      if (res?.success) {
        setMachines(res.data ?? []);
      }
    } catch {
      /* network error — keep stale data */
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDetail = React.useCallback(async (hostname: string) => {
    setDetailLoading(true);
    try {
      const res = await getInventoryMachineDetail(hostname);
      if (res?.success) {
        setSelected(res.data);
      }
    } catch {
      /* keep stale selection */
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // Initial load + polling
  React.useEffect(() => {
    fetchMachines();
    const id = setInterval(fetchMachines, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchMachines]);

  // Refresh detail when machine list updates and a machine is selected
  React.useEffect(() => {
    if (selected) {
      const updated = machines.find((m: MachineInventory) => m.hostname === selected.hostname);
      if (updated) setSelected(updated);
    }
  }, [machines]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Action handlers ──
  const sendCommand = React.useCallback(
    async (action: string, payload?: Record<string, unknown>) => {
      if (!selected) return;
      setActionLoading(true);
      try {
        const res = await queueAgentCommand(selected.hostname, action, payload);
        if (res?.queued) {
          message.success(`Command "${action}" queued for ${selected.hostname}`);
        } else {
          message.error('Failed to queue command');
        }
      } catch {
        message.error('Network error — could not reach local service');
      } finally {
        setActionLoading(false);
      }
    },
    [selected],
  );

  const handleKillProcess = () => {
    const name = killProcessName.trim();
    if (!name) return;
    sendCommand('kill_process', { name });
    setKillProcessName('');
    setKillModalOpen(false);
  };

  const handleRunCommand = () => {
    const cmd = runCmdText.trim();
    if (!cmd) return;
    sendCommand('run_command', { cmd });
    setRunCmdText('');
    setRunModalOpen(false);
  };

  const handleServiceAction = () => {
    const name = serviceActionName.trim();
    if (!name) return;
    sendCommand(serviceActionType, { name });
    setServiceActionName('');
    setServiceModalOpen(false);
  };

  /* ── Column definitions ── */
  const appColumns = [
    { title: 'Name', dataIndex: 'name', key: 'name', ellipsis: true,
      filteredValue: searchText ? [searchText] : null,
      onFilter: (value: any, record: InstalledApp) =>
        (record.name || '').toLowerCase().includes(String(value).toLowerCase()) },
    { title: 'Version', dataIndex: 'version', key: 'version', width: 140 },
    { title: 'Vendor', dataIndex: 'vendor', key: 'vendor', width: 200, ellipsis: true },
  ];

  const processColumns = [
    { title: 'PID', dataIndex: 'pid', key: 'pid', width: 80 },
    { title: 'Name', dataIndex: 'name', key: 'name', ellipsis: true },
    {
      title: 'Memory',
      dataIndex: 'memoryBytes',
      key: 'memoryBytes',
      width: 100,
      render: (v: number | undefined) => v ? fmtBytes(v) : '—',
    },
    {
      title: '',
      key: 'action',
      width: 40,
      render: (_: unknown, r: RunningProcess) => (
        <Tooltip title="Kill this process">
          <Button
            type="text"
            size="small"
            danger
            icon={<StopOutlined />}
            onClick={(e) => {
              e.stopPropagation();
              sendCommand('kill_process', { name: r.name });
            }}
          />
        </Tooltip>
      ),
    },
  ];

  const serviceColumns = [
    { title: 'Name', dataIndex: 'name', key: 'name', width: 200, ellipsis: true },
    { title: 'Display Name', dataIndex: 'displayName', key: 'displayName', ellipsis: true },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (v: string | undefined) => (
        <Tag color={v === 'Running' ? 'green' : v === 'Stopped' ? 'default' : 'orange'}>
          {v ?? '—'}
        </Tag>
      ),
    },
    { title: 'Start Type', dataIndex: 'startType', key: 'startType', width: 100 },
    {
      title: '',
      key: 'action',
      width: 80,
      render: (_: unknown, r: WindowsService) => (
        <Space size={0}>
          <Tooltip title="Restart">
            <Button type="text" size="small" icon={<ReloadOutlined />} onClick={() => sendCommand('restart_service', { name: r.name })} />
          </Tooltip>
          <Tooltip title={r.status === 'Running' ? 'Stop' : 'Start'}>
            <Button type="text" size="small" icon={r.status === 'Running' ? <StopOutlined /> : <ThunderboltOutlined />}
              onClick={() => sendCommand(r.status === 'Running' ? 'stop_service' : 'start_service', { name: r.name })} />
          </Tooltip>
        </Space>
      ),
    },
  ];

  /* ── Security summary component ── */
  const SecurityPanel = ({ sec }: { sec?: SecurityStatus }) => {
    if (!sec) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No security data collected yet" />;
    const fwAll = sec.firewall?.every((f) => f.Enabled);
    const defenderOk = sec.defender?.realTimeProtection;
    return (
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Card size="small" title="Firewall Status">
            <Space size={16} wrap>
              {sec.firewall?.map((f) => (
                <Badge key={f.Name} status={f.Enabled ? 'success' : 'error'} text={`${f.Name}: ${f.Enabled ? 'Enabled' : 'Disabled'}`} />
              ))}
              {!fwAll && (
                <Button size="small" type="primary" danger icon={<SafetyCertificateOutlined />}
                  onClick={() => sendCommand('enable_firewall')}>
                  Enable All Firewalls
                </Button>
              )}
            </Space>
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card size="small" title="Windows Defender">
            {sec.defender ? (
              <Descriptions column={1} size="small">
                <Descriptions.Item label="Real-Time Protection">
                  <Tag color={defenderOk ? 'green' : 'red'}>{defenderOk ? 'Active' : 'Disabled'}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Behavior Monitoring">
                  <Tag color={sec.defender.behaviorMonitoring ? 'green' : 'orange'}>{sec.defender.behaviorMonitoring ? 'Active' : 'Disabled'}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Signature Age">
                  <Tag color={(sec.defender.signatureAge ?? 99) <= 1 ? 'green' : 'red'}>
                    {sec.defender.signatureAge ?? '?'} day(s)
                  </Tag>
                </Descriptions.Item>
              </Descriptions>
            ) : (
              <Typography.Text type="secondary">Defender data not available</Typography.Text>
            )}
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card size="small" title="System Security">
            <Descriptions column={1} size="small">
              <Descriptions.Item label="UAC">
                <Tag color={sec.uacEnabled ? 'green' : 'red'}>{sec.uacEnabled ? 'Enabled' : 'Disabled'}</Tag>
              </Descriptions.Item>
            </Descriptions>
            {sec.antivirus?.length ? (
              <>
                <Typography.Text strong style={{ fontSize: 12 }}>Antivirus Products:</Typography.Text>
                <div style={{ marginTop: 4 }}>
                  {sec.antivirus.map((av, i) => (
                    <Tag key={i} color="blue">{av.name}</Tag>
                  ))}
                </div>
              </>
            ) : null}
          </Card>
        </Col>
        {sec.bitlocker?.length ? (
          <Col span={24}>
            <Card size="small" title="BitLocker Encryption">
              <Table
                size="small"
                pagination={false}
                dataSource={sec.bitlocker}
                rowKey={(r, i) => `${r.drive}-${i}`}
                columns={[
                  { title: 'Drive', dataIndex: 'drive', key: 'drive', width: 80 },
                  { title: 'Status', dataIndex: 'protectionStatus', key: 'status', render: (v: string) => <Tag color={v === 'On' ? 'green' : 'red'}>{v}</Tag> },
                  { title: 'Method', dataIndex: 'encryptionMethod', key: 'method' },
                  { title: 'Volume Status', dataIndex: 'volumeStatus', key: 'vol' },
                  { title: 'Encrypted %', dataIndex: 'percentEncrypted', key: 'pct', render: (v: number) => <Progress percent={v ?? 0} size="small" /> },
                ]}
              />
            </Card>
          </Col>
        ) : null}
      </Row>
    );
  };

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* ── Left panel: machine list ── */}
      <div
        style={{
          width: 280,
          minWidth: 220,
          borderRight: '1px solid var(--ant-color-border, #f0f0f0)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            padding: '12px 16px 8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Typography.Title level={5} style={{ margin: 0 }}>
            Endpoints
          </Typography.Title>
          <Button
            type="text"
            size="small"
            icon={<ReloadOutlined />}
            loading={loading}
            onClick={fetchMachines}
          />
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
          {machines.length === 0 && !loading ? (
            <Empty
              description="No endpoints reported yet"
              style={{ marginTop: 48 }}
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ) : (
            <List
              size="small"
              loading={loading}
              dataSource={machines}
              renderItem={(m: MachineInventory) => (
                <List.Item
                  key={m.hostname}
                  onClick={() => fetchDetail(m.hostname)}
                  style={{
                    cursor: 'pointer',
                    padding: '8px 16px',
                    background:
                      selected?.hostname === m.hostname
                        ? 'var(--ant-color-primary-bg, #e6f4ff)'
                        : undefined,
                  }}
                >
                  <List.Item.Meta
                    title={
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: (m as any).status === 'online' ? '#52c41a' : '#d9d9d9',
                            display: 'inline-block',
                            flexShrink: 0,
                          }}
                        />
                        {m.hostname}
                      </span>
                    }
                    description={
                      <span>
                        {m.os}
                        <Tag
                          color={(m as any).status === 'online' ? 'success' : 'default'}
                          style={{ marginLeft: 8, fontSize: 10, lineHeight: '16px', padding: '0 4px' }}
                        >
                          {(m as any).status === 'online' ? 'Online' : 'Offline'}
                        </Tag>
                      </span>
                    }
                  />
                </List.Item>
              )}
            />
          )}
        </div>
      </div>

      {/* ── Right panel: machine detail ── */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {!selected ? (
          <Empty
            description="Select an endpoint to manage"
            style={{ marginTop: 64 }}
          />
        ) : detailLoading ? (
          <Spin style={{ display: 'block', marginTop: 64 }} />
        ) : (
          <>
            {/* ── Summary strip ── */}
            <Card size="small" style={{ marginBottom: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <Typography.Title level={4} style={{ margin: 0 }}>
                    <DesktopOutlined style={{ marginRight: 8 }} />
                    {selected.hostname}
                  </Typography.Title>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {selected.osInfo?.name ?? selected.os}
                    {selected.osInfo?.version ? ` ${selected.osInfo.version}` : ''}
                    {selected.osInfo?.arch ? ` (${selected.osInfo.arch})` : ''}
                  </Typography.Text>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Tag color={(selected as any).status === 'online' ? 'success' : 'default'}>
                    {(selected as any).status === 'online' ? '● Online' : '○ Offline'}
                  </Tag>
                  {selected.systemInfo?.cpuBrand && (
                    <Tag>{selected.systemInfo.cpuBrand}</Tag>
                  )}
                  {selected.systemInfo?.physicalMemory && (
                    <Tag color="blue">{(Number(selected.systemInfo.physicalMemory) / (1024 ** 3)).toFixed(1)} GB RAM</Tag>
                  )}
                  <Tag color="green">Last seen {new Date(selected.lastSeen).toLocaleString()}</Tag>
                </div>
              </div>
              {/* ── Quick Stats Row ── */}
              <Row gutter={16} style={{ marginTop: 12 }}>
                <Col><Statistic title="Apps" value={selected.installedApps?.length ?? 0} valueStyle={{ fontSize: 18 }} /></Col>
                <Col><Statistic title="Processes" value={selected.processes?.length ?? 0} valueStyle={{ fontSize: 18 }} /></Col>
                <Col><Statistic title="Services" value={selected.services?.length ?? 0} valueStyle={{ fontSize: 18 }} /></Col>
                <Col><Statistic title="Ports" value={selected.listeningPorts?.length ?? 0} valueStyle={{ fontSize: 18 }} /></Col>
                <Col><Statistic title="Patches" value={selected.patches?.length ?? 0} valueStyle={{ fontSize: 18 }} /></Col>
              </Row>
            </Card>

            {/* ── Horizontal tabs ── */}
            <Tabs
              defaultActiveKey="overview"
              style={{ marginTop: 4 }}
              size="middle"
              items={[
                {
                  key: 'overview',
                  label: 'Overview',
                  children: (
                    <Descriptions column={2} size="small" bordered>
                      <Descriptions.Item label="Hostname">{selected.hostname}</Descriptions.Item>
                      <Descriptions.Item label="Platform">{selected.os}</Descriptions.Item>
                      {selected.systemInfo?.computerName && (
                        <Descriptions.Item label="Computer Name">{selected.systemInfo.computerName}</Descriptions.Item>
                      )}
                      {selected.systemInfo?.cpuBrand && (
                        <Descriptions.Item label="CPU">{selected.systemInfo.cpuBrand}</Descriptions.Item>
                      )}
                      {selected.systemInfo?.physicalMemory && (
                        <Descriptions.Item label="Physical Memory">
                          {(Number(selected.systemInfo.physicalMemory) / (1024 ** 3)).toFixed(1)} GB
                        </Descriptions.Item>
                      )}
                      {selected.osInfo?.name && (
                        <Descriptions.Item label="OS">{selected.osInfo.name}</Descriptions.Item>
                      )}
                      {selected.osInfo?.version && (
                        <Descriptions.Item label="Version">
                          {selected.osInfo.version} (Build {selected.osInfo.build ?? '?'})
                        </Descriptions.Item>
                      )}
                      {selected.osInfo?.arch && (
                        <Descriptions.Item label="Architecture">{selected.osInfo.arch}</Descriptions.Item>
                      )}
                      {selected.osInfo?.lastBootTime && (
                        <Descriptions.Item label="Last Boot">
                          {new Date(selected.osInfo.lastBootTime).toLocaleString()}
                        </Descriptions.Item>
                      )}
                      <Descriptions.Item label="Last Seen">
                        {new Date(selected.lastSeen).toLocaleString()}
                      </Descriptions.Item>
                    </Descriptions>
                  ),
                },
                {
                  key: 'software',
                  label: `Software (${selected.installedApps?.length ?? 0})`,
                  children: (
                    <>
                      <Input.Search
                        placeholder="Search installed software..."
                        allowClear
                        onChange={(e) => setSearchText(e.target.value)}
                        style={{ marginBottom: 8, maxWidth: 360 }}
                      />
                      <Table
                        columns={appColumns as any}
                        dataSource={selected.installedApps ?? []}
                        rowKey={(r: InstalledApp) => `${r.name}-${r.version ?? ''}`}
                        size="small"
                        pagination={{ pageSize: 15, showSizeChanger: true }}
                      />
                    </>
                  ),
                },
                {
                  key: 'processes',
                  label: `Processes (${selected.processes?.length ?? 0})`,
                  children: (
                    <Table
                      columns={processColumns as any}
                      dataSource={selected.processes ?? []}
                      rowKey={(r: RunningProcess) => `${r.pid}-${r.name}`}
                      size="small"
                      pagination={{ pageSize: 15, showSizeChanger: true }}
                    />
                  ),
                },
                {
                  key: 'services',
                  label: `Services (${selected.services?.length ?? 0})`,
                  children: selected.services?.length ? (
                    <Table
                      columns={serviceColumns as any}
                      dataSource={selected.services}
                      rowKey={(r: WindowsService, i?: number) => `${r.name}-${i}`}
                      size="small"
                      pagination={{ pageSize: 20, showSizeChanger: true }}
                    />
                  ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No services data collected yet" />,
                },
                {
                  key: 'security',
                  label: (
                    <span>
                      <SafetyCertificateOutlined style={{ marginRight: 4 }} />
                      Security
                    </span>
                  ),
                  children: <SecurityPanel sec={selected.securityStatus} />,
                },
                {
                  key: 'patches',
                  label: `Patches (${selected.patches?.length ?? 0})`,
                  children: selected.patches?.length ? (
                    <Table
                      columns={[
                        { title: 'HotFix ID', dataIndex: 'hotFixId', key: 'hotFixId', width: 140 },
                        { title: 'Description', dataIndex: 'description', key: 'description' },
                        { title: 'Installed On', dataIndex: 'installedOn', key: 'installedOn', width: 200,
                          render: (v: string) => v ? new Date(v).toLocaleDateString() : '—' },
                        { title: 'Installed By', dataIndex: 'installedBy', key: 'installedBy', width: 200 },
                      ]}
                      dataSource={selected.patches}
                      rowKey={(r: WindowsPatch, i?: number) => `${r.hotFixId}-${i}`}
                      size="small"
                      pagination={{ pageSize: 20, showSizeChanger: true }}
                    />
                  ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No patch data collected yet" />,
                },
                {
                  key: 'startup',
                  label: `Startup (${selected.startupPrograms?.length ?? 0})`,
                  children: selected.startupPrograms?.length ? (
                    <Table
                      columns={[
                        { title: 'Name', dataIndex: 'name', key: 'name' },
                        { title: 'Command', dataIndex: 'command', key: 'command', ellipsis: true },
                        { title: 'Source', dataIndex: 'source', key: 'source', ellipsis: true },
                        { title: 'Type', dataIndex: 'type', key: 'type', width: 100,
                          render: (v: string) => <Tag color={v === 'registry' ? 'blue' : 'green'}>{v}</Tag> },
                      ]}
                      dataSource={selected.startupPrograms}
                      rowKey={(r: StartupProgram, i?: number) => `${r.name}-${i}`}
                      size="small"
                      pagination={{ pageSize: 20, showSizeChanger: true }}
                    />
                  ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No startup program data collected yet" />,
                },
                {
                  key: 'network',
                  label: `Network (${selected.networkInterfaces?.length ?? 0})`,
                  children: selected.networkInterfaces?.length ? (
                    <Table
                      columns={[
                        { title: 'Interface', dataIndex: 'interface', key: 'interface' },
                        { title: 'Address', dataIndex: 'address', key: 'address' },
                        { title: 'MAC', dataIndex: 'mac', key: 'mac' },
                        { title: 'Subnet', dataIndex: 'subnet', key: 'subnet' },
                        { title: 'Gateway', dataIndex: 'gateway', key: 'gateway' },
                        { title: 'DHCP', dataIndex: 'dhcpEnabled', key: 'dhcp', width: 80,
                          render: (v: boolean) => v ? <Tag color="green">Yes</Tag> : <Tag>No</Tag> },
                      ]}
                      dataSource={selected.networkInterfaces}
                      rowKey={(r: NetworkInterface, i?: number) => `${r.interface}-${r.address}-${i}`}
                      size="small"
                      pagination={false}
                    />
                  ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No network data collected yet" />,
                },
                {
                  key: 'ports',
                  label: `Ports (${selected.listeningPorts?.length ?? 0})`,
                  children: selected.listeningPorts?.length ? (
                    <Table
                      columns={[
                        { title: 'Address', dataIndex: 'address', key: 'address' },
                        { title: 'Port', dataIndex: 'port', key: 'port', width: 100, sorter: (a: any, b: any) => a.port - b.port },
                        { title: 'PID', dataIndex: 'pid', key: 'pid', width: 100 },
                        { title: 'Process', dataIndex: 'processName', key: 'processName' },
                      ]}
                      dataSource={selected.listeningPorts}
                      rowKey={(r: ListeningPort, i?: number) => `${r.address}-${r.port}-${i}`}
                      size="small"
                      pagination={{ pageSize: 20, showSizeChanger: true }}
                    />
                  ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No listening ports data collected yet" />,
                },
                {
                  key: 'users',
                  label: `Users (${selected.users?.length ?? 0})`,
                  children: selected.users?.length ? (
                    <Table
                      columns={[
                        { title: 'User', dataIndex: 'user', key: 'user' },
                        { title: 'Logon Type', dataIndex: 'logonType', key: 'logonType', width: 100 },
                        { title: 'Start Time', dataIndex: 'startTime', key: 'startTime',
                          render: (v: string) => v ? new Date(v).toLocaleString() : '—' },
                        { title: 'Auth Package', dataIndex: 'authPackage', key: 'authPackage', width: 120 },
                      ]}
                      dataSource={selected.users}
                      rowKey={(r: LoggedInUser, i?: number) => `${r.user}-${i}`}
                      size="small"
                      pagination={false}
                    />
                  ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No logged-in users data collected yet" />,
                },
                {
                  key: 'disks',
                  label: `Disks (${selected.disks?.length ?? 0})`,
                  children: selected.disks?.length ? (
                    <Table
                      columns={[
                        { title: 'Device', dataIndex: 'device', key: 'device', width: 80 },
                        { title: 'Volume', dataIndex: 'volumeName', key: 'volumeName' },
                        { title: 'File System', dataIndex: 'fileSystem', key: 'fs', width: 100 },
                        {
                          title: 'Size',
                          dataIndex: 'size',
                          key: 'size',
                          render: (v: string | undefined) => fmtBytes(v),
                        },
                        {
                          title: 'Free Space',
                          dataIndex: 'freeSpace',
                          key: 'freeSpace',
                          render: (v: string | undefined) => fmtBytes(v),
                        },
                        {
                          title: 'Usage',
                          key: 'usage',
                          render: (_: unknown, r: DiskDrive) => {
                            const total = Number(r.size) || 0;
                            const free = Number(r.freeSpace) || 0;
                            const pct = total > 0 ? Math.round(((total - free) / total) * 100) : 0;
                            return <Progress percent={pct} size="small" status={pct > 90 ? 'exception' : 'normal'} />;
                          },
                        },
                      ]}
                      dataSource={selected.disks}
                      rowKey={(r: DiskDrive, i?: number) => `${r.device}-${i}`}
                      size="small"
                      pagination={false}
                    />
                  ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No disk data collected yet" />,
                },
                {
                  key: 'actions',
                  label: (
                    <span>
                      <ToolOutlined style={{ marginRight: 4 }} />
                      Endpoint Control
                    </span>
                  ),
                  children: (
                    <Row gutter={[16, 16]}>
                      <Col span={24}>
                        <Card size="small" title="Inventory & Monitoring">
                          <Space wrap>
                            <Button icon={<CloudSyncOutlined />} loading={actionLoading}
                              onClick={() => sendCommand('force_inventory')}>Force Inventory Refresh</Button>
                            <Button icon={<ReloadOutlined />} loading={actionLoading}
                              onClick={() => sendCommand('collect_logs')}>Collect Logs</Button>
                          </Space>
                        </Card>
                      </Col>
                      <Col xs={24} md={12}>
                        <Card size="small" title="Process & Command">
                          <Space wrap>
                            <Button danger icon={<StopOutlined />} loading={actionLoading}
                              onClick={() => setKillModalOpen(true)}>Kill Process</Button>
                            <Button icon={<CodeOutlined />} loading={actionLoading}
                              onClick={() => setRunModalOpen(true)}>Run Command</Button>
                          </Space>
                        </Card>
                      </Col>
                      <Col xs={24} md={12}>
                        <Card size="small" title="Service Management">
                          <Space wrap>
                            <Button icon={<SettingOutlined />} loading={actionLoading}
                              onClick={() => { setServiceActionType('restart_service'); setServiceModalOpen(true); }}>
                              Restart Service
                            </Button>
                            <Button icon={<StopOutlined />} loading={actionLoading}
                              onClick={() => { setServiceActionType('stop_service'); setServiceModalOpen(true); }}>
                              Stop Service
                            </Button>
                            <Button icon={<ThunderboltOutlined />} loading={actionLoading}
                              onClick={() => { setServiceActionType('start_service'); setServiceModalOpen(true); }}>
                              Start Service
                            </Button>
                          </Space>
                        </Card>
                      </Col>
                      <Col xs={24} md={12}>
                        <Card size="small" title="Security Actions">
                          <Space wrap>
                            <Button icon={<SafetyCertificateOutlined />} loading={actionLoading}
                              onClick={() => sendCommand('enable_firewall')}>Enable Firewall</Button>
                            <Button icon={<LockOutlined />} loading={actionLoading}
                              onClick={() => sendCommand('lock_machine')}>Lock Machine</Button>
                          </Space>
                        </Card>
                      </Col>
                      <Col xs={24} md={12}>
                        <Card size="small" title="Power Management">
                          <Space wrap>
                            <Button icon={<ReloadOutlined />} loading={actionLoading}
                              onClick={() => Modal.confirm({
                                title: 'Restart Machine?',
                                content: `This will restart ${selected.hostname}. Are you sure?`,
                                okText: 'Restart',
                                okType: 'danger',
                                onOk: () => sendCommand('restart_machine'),
                              })}>
                              Restart Machine
                            </Button>
                            <Button danger icon={<PoweroffOutlined />} loading={actionLoading}
                              onClick={() => Modal.confirm({
                                title: 'Shutdown Machine?',
                                content: `This will shut down ${selected.hostname}. Are you sure?`,
                                okText: 'Shutdown',
                                okType: 'danger',
                                onOk: () => sendCommand('shutdown_machine'),
                              })}>
                              Shutdown
                            </Button>
                          </Space>
                        </Card>
                      </Col>
                      <Col xs={24} md={12}>
                        <Card size="small" title="Software Management">
                          <Space wrap>
                            <Button icon={<CloudSyncOutlined />} loading={actionLoading}
                              onClick={() => sendCommand('install_update')}>Install Updates</Button>
                          </Space>
                        </Card>
                      </Col>
                    </Row>
                  ),
                },
              ]}
            />

            {/* Kill Process modal */}
            <Modal
              title="Kill Process"
              open={killModalOpen}
              onOk={handleKillProcess}
              onCancel={() => { setKillModalOpen(false); setKillProcessName(''); }}
              okText="Kill"
              okButtonProps={{ danger: true, disabled: !killProcessName.trim() }}
            >
              <Typography.Text>Enter the process name to terminate:</Typography.Text>
              <Input
                style={{ marginTop: 8 }}
                placeholder="e.g. notepad.exe"
                value={killProcessName}
                onChange={(e) => setKillProcessName(e.target.value)}
                onPressEnter={handleKillProcess}
                autoFocus
              />
            </Modal>

            {/* Run Command modal */}
            <Modal
              title="Run Command"
              open={runModalOpen}
              onOk={handleRunCommand}
              onCancel={() => { setRunModalOpen(false); setRunCmdText(''); }}
              okText="Run"
              okButtonProps={{ disabled: !runCmdText.trim() }}
            >
              <Typography.Text>Enter a shell command to execute on the agent:</Typography.Text>
              <Input.TextArea
                style={{ marginTop: 8 }}
                rows={3}
                placeholder="e.g. dir C:\\Users"
                value={runCmdText}
                onChange={(e) => setRunCmdText(e.target.value)}
                autoFocus
              />
            </Modal>

            {/* Service Action modal */}
            <Modal
              title={serviceActionType === 'restart_service' ? 'Restart Service' :
                serviceActionType === 'stop_service' ? 'Stop Service' : 'Start Service'}
              open={serviceModalOpen}
              onOk={handleServiceAction}
              onCancel={() => { setServiceModalOpen(false); setServiceActionName(''); }}
              okText={serviceActionType === 'restart_service' ? 'Restart' :
                serviceActionType === 'stop_service' ? 'Stop' : 'Start'}
              okButtonProps={{ disabled: !serviceActionName.trim() }}
            >
              <Typography.Text>Enter the service name:</Typography.Text>
              <Input
                style={{ marginTop: 8 }}
                placeholder="e.g. Spooler"
                value={serviceActionName}
                onChange={(e) => setServiceActionName(e.target.value)}
                onPressEnter={handleServiceAction}
                autoFocus
              />
            </Modal>
          </>
        )}
      </div>
    </div>
  );
};

export default LiveInventoryPage;
