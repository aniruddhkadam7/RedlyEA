import { SendOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Input, Space, Typography, theme } from 'antd';
import React from 'react';

type AgentMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
};

const makeId = () => `msg_${Date.now()}_${Math.random().toString(16).slice(2)}`;

const ArchitectureAgentPanel: React.FC = () => {
  const { token } = theme.useToken();
  const [messages, setMessages] = React.useState<AgentMessage[]>(() => [
    {
      id: makeId(),
      role: 'assistant',
      createdAt: new Date().toISOString(),
      content:
        'Architecture Agent (stub) is UI-only scaffolding. No automation is implemented and no repository data will be mutated.',
    },
  ]);

  const [draft, setDraft] = React.useState('');

  const send = React.useCallback(() => {
    const text = draft.trim();
    if (!text) return;

    const now = new Date().toISOString();

    // UI-only: local, ephemeral message list. No network calls.
    setMessages((prev) => [
      ...prev,
      { id: makeId(), role: 'user', createdAt: now, content: text },
      {
        id: makeId(),
        role: 'assistant',
        createdAt: now,
        content:
          'Not connected. This panel is a non-functional stub (no automation, no actions, no data mutations).',
      },
    ]);

    setDraft('');
  }, [draft]);

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      <div style={{ padding: 10 }}>
        <Alert
          type="info"
          showIcon
          message="Architecture Agent"
          description="UI-only scaffolding for a future agent panel. Nothing here will run automatically."
        />
      </div>

      <div
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          overflow: 'auto',
          padding: '0 10px 10px',
        }}
      >
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          {messages.map((m) => (
            <Card
              key={m.id}
              size="small"
              styles={{ body: { padding: 10 } }}
              style={{
                width: '100%',
                borderColor:
                  m.role === 'user' ? token.colorPrimaryBorder : undefined,
              }}
            >
              <Space direction="vertical" size={2} style={{ width: '100%' }}>
                <Space
                  style={{ justifyContent: 'space-between', width: '100%' }}
                >
                  <Typography.Text strong>
                    {m.role === 'user' ? 'You' : 'Architecture Agent'}
                  </Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {new Date(m.createdAt).toLocaleTimeString()}
                  </Typography.Text>
                </Space>
                <Typography.Paragraph
                  style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}
                >
                  {m.content}
                </Typography.Paragraph>
              </Space>
            </Card>
          ))}
        </Space>
      </div>

      <div
        style={{
          flex: '0 0 auto',
          borderTop: `1px solid ${token.colorBorderSecondary}`,
          padding: 10,
          background: token.colorFillQuaternary,
        }}
      >
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Input.TextArea
            value={draft}
            placeholder="Ask about the architecture… (stub: no agent connected)"
            autoSize={{ minRows: 2, maxRows: 6 }}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                send();
              }
            }}
          />
          <Space style={{ justifyContent: 'space-between', width: '100%' }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Ctrl+Enter to send
            </Typography.Text>
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={send}
              disabled={!draft.trim()}
            >
              Send
            </Button>
          </Space>
        </Space>
      </div>
    </div>
  );
};

export default ArchitectureAgentPanel;
