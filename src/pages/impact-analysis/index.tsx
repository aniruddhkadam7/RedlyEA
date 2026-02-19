import { Button, Space, Typography } from 'antd';
import React from 'react';
import { useIdeShell } from '@/components/IdeShellLayout';

const ImpactAnalysis: React.FC = () => {
  const { openWorkspaceTab } = useIdeShell();

  return (
    <div style={{ padding: 16 }}>
      <Space direction="vertical" size={8}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Impact Analysis
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
          Open the read-only Impact Analysis workspace tab to configure and run
          an explicit analysis.
        </Typography.Paragraph>
        <div>
          <Button
            type="primary"
            onClick={() =>
              openWorkspaceTab({ type: 'analysis', kind: 'impact' })
            }
          >
            Open Impact Analysis Tab
          </Button>
        </div>
      </Space>
    </div>
  );
};

export default ImpactAnalysis;
