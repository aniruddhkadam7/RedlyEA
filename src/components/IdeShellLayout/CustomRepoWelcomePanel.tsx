import { ExperimentOutlined } from '@ant-design/icons';
import { Button, Typography } from 'antd';
import React from 'react';

export interface CustomRepoWelcomePanelProps {
  /** Callback to navigate to the Metamodel editor. */
  onNavigateToMetamodel?: () => void;
}

/**
 * Welcome panel displayed in the canvas area when a Custom (Architect Mode)
 * repository has no element types defined yet.
 */
const CustomRepoWelcomePanel: React.FC<CustomRepoWelcomePanelProps> = ({
  onNavigateToMetamodel,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: 48,
        textAlign: 'center',
        gap: 16,
      }}
    >
      <ExperimentOutlined
        style={{ fontSize: 48, color: '#8c8c8c', marginBottom: 8 }}
      />
      <Typography.Title level={4} style={{ marginBottom: 0, color: '#d9d9d9' }}>
        Your architecture language is not defined yet
      </Typography.Title>
      <Typography.Paragraph
        type="secondary"
        style={{ maxWidth: 480, margin: '0 auto' }}
      >
        This repository is empty. Start by creating your first Element Type in
        the Metamodel. Once you define element types and relationship types,
        they will appear in the toolbox and you can begin modeling.
      </Typography.Paragraph>
      {onNavigateToMetamodel ? (
        <Button
          type="primary"
          icon={<ExperimentOutlined />}
          onClick={onNavigateToMetamodel}
          size="large"
        >
          Create Element Type
        </Button>
      ) : null}
    </div>
  );
};

export default CustomRepoWelcomePanel;
