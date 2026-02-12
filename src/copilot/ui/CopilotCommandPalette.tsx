import React from 'react';

import { RobotOutlined, SearchOutlined } from '@ant-design/icons';
import { Input, List, Modal, Space, Tag, Tooltip, Typography } from 'antd';

import { trackCopilotEvent } from '@/copilot/telemetry';

type CommandItem = {
  id: string;
  title: string;
  description: string;
};

const COMMANDS: CommandItem[] = [
  {
    id: 'explain_application',
    title: 'Explain this application',
    description: 'Summarize purpose, dependencies, and responsibilities (read-only).',
  },
  {
    id: 'simulate_outage_impact',
    title: 'Simulate outage impact',
    description: 'Define a scenario and outline affected scope (no execution).',
  },
  {
    id: 'check_governance_compliance',
    title: 'Check governance compliance',
    description: 'List governance checks to run (no background execution).',
  },
  {
    id: 'suggest_missing_relationships',
    title: 'Suggest missing relationships',
    description: 'Propose candidate relationships for review (no auto-creation).',
  },
];

const isPaletteShortcut = (e: KeyboardEvent) => {
  const isMac = navigator.platform.toLowerCase().includes('mac');
  const modPressed = isMac ? e.metaKey : e.ctrlKey;
  return modPressed && e.shiftKey && e.key.toLowerCase() === 'a';
};

const CopilotCommandPalette: React.FC = () => {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isPaletteShortcut(e)) return;
      e.preventDefault();
      e.stopPropagation();
      trackCopilotEvent('copilot_command_palette_opened');
      setOpen(true);
    };

    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true } as any);
  }, []);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COMMANDS;
    return COMMANDS.filter((c) => `${c.title} ${c.description}`.toLowerCase().includes(q));
  }, [query]);

  return (
    <Modal
      open={open}
      title={
        <Space size={8} align="center">
          <RobotOutlined />
          <span>Copilot Command Palette</span>
          <Tag>Coming soon</Tag>
        </Space>
      }
      onCancel={() => setOpen(false)}
      footer={null}
      width={640}
      destroyOnClose
    >
      <Space direction="vertical" size={10} style={{ width: '100%' }}>
        <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
          Commands are visible but disabled. Shortcut: Ctrl/Cmd + Shift + A
        </Typography.Paragraph>

        <Input
          allowClear
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Copilot intents (coming soon)"
          prefix={<SearchOutlined />}
        />

        <List
          bordered
          dataSource={filtered}
          renderItem={(item) => (
            <Tooltip title="Coming soon" placement="right">
              <List.Item
                style={{ opacity: 0.65, cursor: 'not-allowed' }}
                onClick={() => {
                  // Telemetry hook (disabled): attempted command invocation.
                  trackCopilotEvent('copilot_command_invoked', {
                    type: 'copilot_command_invoked',
                    commandId: item.id,
                    enabled: false,
                  });
                }}
              >
                <Space direction="vertical" size={2} style={{ width: '100%' }}>
                  <Space size={8} align="baseline">
                    <Typography.Text disabled>{item.title}</Typography.Text>
                    <Tag>Coming soon</Tag>
                  </Space>
                  <Typography.Text type="secondary" disabled>
                    {item.description}
                  </Typography.Text>
                </Space>
              </List.Item>
            </Tooltip>
          )}
        />
      </Space>
    </Modal>
  );
};

export default CopilotCommandPalette;
