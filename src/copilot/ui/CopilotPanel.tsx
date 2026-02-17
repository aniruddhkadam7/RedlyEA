import React from 'react';

import { Alert, Collapse, Divider, List, Space, Tag, Typography } from 'antd';
import { Button, Input, Select, Tooltip } from 'antd';
import { SearchOutlined } from '@ant-design/icons';

import { COPILOT_SAFETY_RULES, COPILOT_TRUST_BANNER } from '@/copilot/safetyRules';
import { useCopilotContext } from '@/copilot/CopilotContextProvider';
import type { CopilotExpectedOutputType, CopilotInteractionContract, CopilotUserIntent } from '@/copilot/contracts';

const DISABLED_INTENTS: Array<{ title: string; description: string }> = [
  {
    title: 'Explain this application',
    description: 'Summarize purpose, dependencies, and responsibilities (read-only).',
  },
  {
    title: 'Simulate outage impact',
    description: 'Define a what-if scenario and outline affected scope (no execution).',
  },
  {
    title: 'Check governance compliance',
    description: 'List governance checks to run (no background execution).',
  },
  {
    title: 'Suggest missing relationships',
    description: 'Propose candidate relationships for review (no auto-creation).',
  },
];

const CopilotPanel: React.FC = () => {
  const { snapshot } = useCopilotContext();
  const [query, setQuery] = React.useState('');
  const [intent, setIntent] = React.useState<CopilotUserIntent>('explain_application');
  const [expectedOutputType, setExpectedOutputType] = React.useState<CopilotExpectedOutputType>('explanation');
  const [details, setDetails] = React.useState('');

  const snapshotText = React.useMemo(() => {
    try {
      return JSON.stringify(snapshot, null, 2);
    } catch {
      return '{"error":"Unable to serialize snapshot"}';
    }
  }, [snapshot]);

  const contract: CopilotInteractionContract = React.useMemo(
    () => ({
      inputContext: snapshot,
      userIntent: intent,
      expectedOutputType,
    }),
    [snapshot, intent, expectedOutputType],
  );

  const contractText = React.useMemo(() => {
    try {
      // Note: details are intentionally not part of the contract in this phase.
      // The contract stays deterministic and structured.
      return JSON.stringify(contract, null, 2);
    } catch {
      return '{"error":"Unable to serialize contract"}';
    }
  }, [contract]);

  const filteredIntents = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return DISABLED_INTENTS;
    return DISABLED_INTENTS.filter((i) => `${i.title} ${i.description}`.toLowerCase().includes(q));
  }, [query]);

  const INTENT_OPTIONS: Array<{ value: CopilotUserIntent; label: string }> = [
    { value: 'explain_application', label: 'Explain this application' },
    { value: 'simulate_outage_impact', label: 'Simulate outage impact' },
    { value: 'check_governance_compliance', label: 'Check governance compliance' },
    { value: 'suggest_missing_relationships', label: 'Suggest missing relationships' },
    { value: 'what_if_scenario', label: 'What-if scenario' },
  ];

  const OUTPUT_OPTIONS: Array<{ value: CopilotExpectedOutputType; label: string }> = [
    { value: 'explanation', label: 'Explanation' },
    { value: 'suggestion', label: 'Suggestion' },
    { value: 'warning', label: 'Warning' },
    { value: 'scenario', label: 'Scenario' },
  ];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: 12 }}>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Space size={8} align="baseline">
            <Typography.Text strong>EA Copilot</Typography.Text>
            <Tag color="default">Coming soon</Tag>
          </Space>

          <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
            IDE-side assistant for enterprise architects. Proposes, never executes.
          </Typography.Paragraph>

          <Alert
            type="info"
            showIcon
            message={COPILOT_TRUST_BANNER}
            description="This panel is a UI shell only. No AI logic is implemented in this phase."
          />

          <Tooltip title="Coming soon">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search Copilot (coming soon)"
              prefix={<SearchOutlined />}
              allowClear
            />
          </Tooltip>
        </Space>
      </div>

      <Divider style={{ margin: 0 }} />

      <div style={{ padding: 12, overflow: 'auto', flex: 1 }}>
        <Space direction="vertical" size={14} style={{ width: '100%' }}>
          <Collapse
            size="small"
            defaultActiveKey={[]}
            items={[
              {
                key: 'context',
                label: 'Context snapshot (read-only)',
                children: (
                  <Typography.Paragraph
                    style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}
                  >
                    {snapshotText}
                  </Typography.Paragraph>
                ),
              },
              {
                key: 'contract',
                label: 'Interaction contract (structured)',
                children: (
                  <Typography.Paragraph
                    style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}
                  >
                    {contractText}
                  </Typography.Paragraph>
                ),
              },
            ]}
          />

          <div>
            <Typography.Text strong>Safety & trust rules</Typography.Text>
            <List
              size="small"
              style={{ marginTop: 8 }}
              dataSource={COPILOT_SAFETY_RULES}
              renderItem={(rule) => (
                <List.Item style={{ paddingLeft: 0, paddingRight: 0 }}>
                  <Typography.Text type="secondary">{rule.statement}</Typography.Text>
                </List.Item>
              )}
            />
          </div>

          <div>
            <Typography.Text strong>Planned intents</Typography.Text>
            <Typography.Paragraph type="secondary" style={{ marginTop: 6 }}>
              Commands are visible but disabled. Tooltip: “Coming soon”.
            </Typography.Paragraph>

            <List
              size="small"
              dataSource={filteredIntents}
              renderItem={(item) => (
                <List.Item style={{ paddingLeft: 0, paddingRight: 0 }}>
                  <Space direction="vertical" size={2}>
                    <Space size={8} align="baseline">
                      <Typography.Text disabled>{item.title}</Typography.Text>
                      <Tag>Coming soon</Tag>
                    </Space>
                    <Typography.Text type="secondary" disabled>
                      {item.description}
                    </Typography.Text>
                  </Space>
                </List.Item>
              )}
            />
          </div>
        </Space>
      </div>

      {/* Command bar (GitHub Copilot-like; UI-only) */}
      <Divider style={{ margin: 0 }} />
      <div style={{ padding: 12 }}>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Space size={8} style={{ width: '100%' }} wrap>
            <Select<CopilotUserIntent>
              value={intent}
              onChange={setIntent}
              options={INTENT_OPTIONS}
              style={{ minWidth: 240, flex: 1 }}
              size="middle"
            />
            <Select<CopilotExpectedOutputType>
              value={expectedOutputType}
              onChange={setExpectedOutputType}
              options={OUTPUT_OPTIONS}
              style={{ minWidth: 160 }}
              size="middle"
            />
          </Space>

          <Input.TextArea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Add details (UI-only; not executed in this phase)"
            autoSize={{ minRows: 2, maxRows: 4 }}
          />

          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Typography.Text type="secondary">
              Execution is disabled. Copilot proposes only.
            </Typography.Text>
            <Tooltip title="Coming soon">
              <Button type="primary" disabled>
                Run
              </Button>
            </Tooltip>
          </Space>
        </Space>
      </div>
    </div>
  );
};

export default CopilotPanel;
