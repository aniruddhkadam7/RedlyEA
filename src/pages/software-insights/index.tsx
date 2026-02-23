import { BarChartOutlined, ReloadOutlined } from '@ant-design/icons';
import { Button, Card, Empty, Spin, Table, Tag, Typography } from 'antd';
import React from 'react';
import {
  getApplicationUsage,
  type AppUsageSummary,
} from '@/services/ea/usageAnalytics';

const POLL_INTERVAL_MS = 15_000;

const usageColor = (level: string) => {
  switch (level) {
    case 'Frequent':
      return 'green';
    case 'Occasional':
      return 'blue';
    case 'Rare':
      return 'default';
    default:
      return 'default';
  }
};

const SoftwareInsightsPage: React.FC = () => {
  const [data, setData] = React.useState<AppUsageSummary[]>([]);
  const [loading, setLoading] = React.useState(false);

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await getApplicationUsage();
      if (res?.success) {
        setData(res.data ?? []);
      }
    } catch {
      /* keep stale data */
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchData]);

  const columns = [
    {
      title: 'Application',
      dataIndex: 'name',
      key: 'name',
      sorter: (a: AppUsageSummary, b: AppUsageSummary) =>
        a.name.localeCompare(b.name),
    },
    {
      title: 'Machines Using',
      dataIndex: 'machines',
      key: 'machines',
      width: 140,
      sorter: (a: AppUsageSummary, b: AppUsageSummary) =>
        a.machines - b.machines,
    },
    {
      title: 'Observations',
      dataIndex: 'observations',
      key: 'observations',
      width: 130,
      sorter: (a: AppUsageSummary, b: AppUsageSummary) =>
        a.observations - b.observations,
    },
    {
      title: 'Days Observed',
      dataIndex: 'daysObserved',
      key: 'daysObserved',
      width: 130,
      sorter: (a: AppUsageSummary, b: AppUsageSummary) =>
        a.daysObserved - b.daysObserved,
    },
    {
      title: 'Last Seen',
      dataIndex: 'lastSeen',
      key: 'lastSeen',
      width: 200,
      sorter: (a: AppUsageSummary, b: AppUsageSummary) =>
        a.lastSeen - b.lastSeen,
      render: (v: number) => (v ? new Date(v).toLocaleString() : '—'),
    },
    {
      title: 'Usage Level',
      dataIndex: 'usage',
      key: 'usage',
      width: 120,
      filters: [
        { text: 'Frequent', value: 'Frequent' },
        { text: 'Occasional', value: 'Occasional' },
        { text: 'Rare', value: 'Rare' },
      ],
      onFilter: (value: React.Key | boolean, record: AppUsageSummary) =>
        record.usage === value,
      render: (v: string) => <Tag color={usageColor(v)}>{v}</Tag>,
    },
  ];

  return (
    <div style={{ padding: 24, height: '100%', overflow: 'auto' }}>
      <Card
        size="small"
        style={{ marginBottom: 16 }}
        title={
          <span>
            <BarChartOutlined style={{ marginRight: 8 }} />
            Software Insights
          </span>
        }
        extra={
          <Button
            type="text"
            size="small"
            icon={<ReloadOutlined />}
            loading={loading}
            onClick={fetchData}
          />
        }
      >
        <Typography.Text type="secondary">
          Application usage analytics aggregated across all reporting machines.
          Classification: <Tag color="green">Frequent</Tag> &gt; 100 observations,{' '}
          <Tag color="blue">Occasional</Tag> 10–100,{' '}
          <Tag>Rare</Tag> &lt; 10.
        </Typography.Text>
      </Card>

      {loading && data.length === 0 ? (
        <Spin style={{ display: 'block', marginTop: 64 }} />
      ) : data.length === 0 ? (
        <Empty
          description="No usage data available yet. Ensure agents are reporting processUsage."
          style={{ marginTop: 64 }}
        />
      ) : (
        <Table
          columns={columns}
          dataSource={data}
          rowKey={(r: AppUsageSummary) => r.name}
          size="small"
          pagination={{ pageSize: 25, showSizeChanger: true, showTotal: (t) => `${t} applications` }}
        />
      )}
    </div>
  );
};

export default SoftwareInsightsPage;
