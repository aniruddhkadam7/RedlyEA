/**
 * Architect Mode Metamodel Editor
 *
 * Full CRUD for custom element types and relationship types in
 * CUSTOM (Architect Mode) repositories.
 */
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import {
  Button,
  Card,
  Collapse,
  ColorPicker,
  Divider,
  Empty,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd';
import React from 'react';
import { useEaRepository } from '@/ea/EaRepositoryContext';
import { message } from '@/ea/eaConsole';
import {
  addCustomElementType,
  addCustomRelationshipType,
  type CustomElementType,
  type CustomPropertyDefinition,
  type CustomPropertyType,
  loadCustomMetaModel,
  removeCustomElementType,
  removeCustomRelationshipType,
  updateCustomElementType,
} from '@/repository/customArchitectMetaModel';

const PROPERTY_TYPES: CustomPropertyType[] = [
  'string',
  'number',
  'date',
  'enum',
  'boolean',
];

const LINE_STYLES = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'dotted', label: 'Dotted' },
] as const;

const ARROW_DIRECTIONS = [
  { value: 'forward', label: 'Forward →' },
  { value: 'backward', label: '← Backward' },
  { value: 'both', label: '↔ Both' },
  { value: 'none', label: '— None' },
] as const;

const DEFAULT_ICONS = [
  'box',
  'circle',
  'diamond',
  'hexagon',
  'star',
  'triangle',
  'square',
  'cylinder',
  'cloud',
  'folder',
];

const ArchitectMetaModelEditor: React.FC = () => {
  const { metadata } = useEaRepository();
  const repositoryName = metadata?.repositoryName ?? '';

  const [revision, setRevision] = React.useState(0);
  const customModel = React.useMemo(
    () => loadCustomMetaModel(repositoryName),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [repositoryName, revision],
  );

  // Listen for external changes
  React.useEffect(() => {
    const handler = () => setRevision((r) => r + 1);
    window.addEventListener('ea:customMetaModelChanged', handler);
    return () =>
      window.removeEventListener('ea:customMetaModelChanged', handler);
  }, []);

  // --- Element Type Modal ---
  const [elementModalOpen, setElementModalOpen] = React.useState(false);
  const [editingElementId, setEditingElementId] = React.useState<string | null>(
    null,
  );
  const [elementForm] = Form.useForm();

  const openCreateElement = () => {
    setEditingElementId(null);
    elementForm.resetFields();
    elementForm.setFieldsValue({
      color: '#4A90D9',
      icon: 'box',
      properties: [],
    });
    setElementModalOpen(true);
  };

  const openEditElement = (et: CustomElementType) => {
    setEditingElementId(et.id);
    elementForm.setFieldsValue({
      name: et.name,
      color: et.color,
      icon: et.icon,
      description: et.description,
      properties: et.properties ?? [],
    });
    setElementModalOpen(true);
  };

  const handleElementSubmit = () => {
    elementForm
      .validateFields()
      .then((values) => {
        const properties: CustomPropertyDefinition[] = (
          values.properties ?? []
        ).map((p: any, idx: number) => ({
          id: p.id || `prop-${idx}-${Date.now()}`,
          name: p.name,
          type: p.type || 'string',
          enumValues: p.enumValues,
          required: p.required ?? false,
          description: p.description ?? '',
        }));

        const colorStr =
          typeof values.color === 'string'
            ? values.color
            : (values.color?.toHexString?.() ?? '#4A90D9');

        if (editingElementId) {
          updateCustomElementType(repositoryName, editingElementId, {
            name: values.name,
            color: colorStr,
            icon: values.icon,
            description: values.description || '',
            properties,
          });
          message.success('Element type updated.');
        } else {
          addCustomElementType(repositoryName, {
            name: values.name,
            color: colorStr,
            icon: values.icon,
            description: values.description || '',
            properties,
          });
          message.success('Element type created.');
        }
        setElementModalOpen(false);
        setRevision((r) => r + 1);
      })
      .catch(() => {
        // validation failed
      });
  };

  const handleDeleteElement = (id: string, name: string) => {
    Modal.confirm({
      title: `Delete element type "${name}"?`,
      content:
        'This will also remove any relationship types that reference this element type.',
      okText: 'Delete',
      okButtonProps: { danger: true },
      onOk: () => {
        removeCustomElementType(repositoryName, id);
        message.success('Element type deleted.');
        setRevision((r) => r + 1);
      },
    });
  };

  // --- Relationship Type Modal ---
  const [relModalOpen, setRelModalOpen] = React.useState(false);
  const [relForm] = Form.useForm();

  const openCreateRelationship = () => {
    relForm.resetFields();
    relForm.setFieldsValue({
      arrowDirection: 'forward',
      lineStyle: 'solid',
      color: '#8c8c8c',
    });
    setRelModalOpen(true);
  };

  const handleRelSubmit = () => {
    relForm
      .validateFields()
      .then((values) => {
        const colorStr =
          typeof values.color === 'string'
            ? values.color
            : (values.color?.toHexString?.() ?? '#8c8c8c');

        addCustomRelationshipType(repositoryName, {
          name: values.name,
          sourceElementTypeId: values.sourceElementTypeId,
          targetElementTypeId: values.targetElementTypeId,
          arrowDirection: values.arrowDirection,
          lineStyle: values.lineStyle,
          color: colorStr,
          description: values.description || '',
        });
        message.success('Relationship type created.');
        setRelModalOpen(false);
        setRevision((r) => r + 1);
      })
      .catch(() => {
        // validation failed
      });
  };

  const handleDeleteRelationship = (id: string, name: string) => {
    Modal.confirm({
      title: `Delete relationship type "${name}"?`,
      okText: 'Delete',
      okButtonProps: { danger: true },
      onOk: () => {
        removeCustomRelationshipType(repositoryName, id);
        message.success('Relationship type deleted.');
        setRevision((r) => r + 1);
      },
    });
  };

  const elementTypeOptions = customModel.elementTypes.map((et) => ({
    value: et.id,
    label: et.name,
  }));

  const resolveElementName = (id: string) =>
    customModel.elementTypes.find((et) => et.id === id)?.name ?? id;

  if (!metadata || metadata.initializationMode !== 'CUSTOM') {
    return null;
  }

  return (
    <div style={{ padding: 8 }}>
      <Typography.Title level={5} style={{ marginTop: 0 }}>
        Architect Mode — Metamodel Editor
      </Typography.Title>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
        Define your own architecture language: element types, properties, and
        relationships.
      </Typography.Paragraph>

      {/* ── Element Types ── */}
      <Collapse
        defaultActiveKey={['elementTypes']}
        ghost
        items={[
          {
            key: 'elementTypes',
            label: (
              <Typography.Text strong>
                Element Types ({customModel.elementTypes.length})
              </Typography.Text>
            ),
            extra: (
              <Button
                type="link"
                size="small"
                icon={<PlusOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  openCreateElement();
                }}
              >
                Add
              </Button>
            ),
            children:
              customModel.elementTypes.length === 0 ? (
                <Empty
                  description="No element types defined"
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                >
                  <Button type="primary" onClick={openCreateElement}>
                    Create Element Type
                  </Button>
                </Empty>
              ) : (
                <Space direction="vertical" size={4} style={{ width: '100%' }}>
                  {customModel.elementTypes.map((et) => (
                    <Card
                      key={et.id}
                      size="small"
                      style={{ borderLeft: `3px solid ${et.color}` }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <div>
                          <Typography.Text strong>{et.name}</Typography.Text>
                          {et.properties.length > 0 ? (
                            <Typography.Text
                              type="secondary"
                              style={{ marginLeft: 8 }}
                            >
                              ({et.properties.length} properties)
                            </Typography.Text>
                          ) : null}
                        </div>
                        <Space size={4}>
                          <Button
                            type="text"
                            size="small"
                            icon={<EditOutlined />}
                            onClick={() => openEditElement(et)}
                          />
                          <Button
                            type="text"
                            size="small"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={() => handleDeleteElement(et.id, et.name)}
                          />
                        </Space>
                      </div>
                      {et.description ? (
                        <Typography.Text
                          type="secondary"
                          style={{ fontSize: 12 }}
                        >
                          {et.description}
                        </Typography.Text>
                      ) : null}
                    </Card>
                  ))}
                </Space>
              ),
          },
        ]}
      />

      <Divider style={{ margin: '12px 0' }} />

      {/* ── Relationship Types ── */}
      <Collapse
        defaultActiveKey={['relationshipTypes']}
        ghost
        items={[
          {
            key: 'relationshipTypes',
            label: (
              <Typography.Text strong>
                Relationship Types ({customModel.relationshipTypes.length})
              </Typography.Text>
            ),
            extra: (
              <Button
                type="link"
                size="small"
                icon={<PlusOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  openCreateRelationship();
                }}
                disabled={customModel.elementTypes.length === 0}
              >
                Add
              </Button>
            ),
            children:
              customModel.relationshipTypes.length === 0 ? (
                <Empty
                  description={
                    customModel.elementTypes.length === 0
                      ? 'Create element types first'
                      : 'No relationship types defined'
                  }
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                >
                  {customModel.elementTypes.length > 0 ? (
                    <Button type="primary" onClick={openCreateRelationship}>
                      Create Relationship Type
                    </Button>
                  ) : null}
                </Empty>
              ) : (
                <Space direction="vertical" size={4} style={{ width: '100%' }}>
                  {customModel.relationshipTypes.map((rt) => (
                    <Card key={rt.id} size="small">
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <div>
                          <Typography.Text strong>{rt.name}</Typography.Text>
                          <div style={{ fontSize: 12, color: '#8c8c8c' }}>
                            <Tag>
                              {resolveElementName(rt.sourceElementTypeId)}
                            </Tag>
                            {rt.arrowDirection === 'forward'
                              ? '→'
                              : rt.arrowDirection === 'backward'
                                ? '←'
                                : rt.arrowDirection === 'both'
                                  ? '↔'
                                  : '—'}
                            <Tag>
                              {resolveElementName(rt.targetElementTypeId)}
                            </Tag>
                          </div>
                        </div>
                        <Button
                          type="text"
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={() =>
                            handleDeleteRelationship(rt.id, rt.name)
                          }
                        />
                      </div>
                    </Card>
                  ))}
                </Space>
              ),
          },
        ]}
      />

      {/* ── Element Type Modal ── */}
      <Modal
        title={editingElementId ? 'Edit Element Type' : 'Create Element Type'}
        open={elementModalOpen}
        onOk={handleElementSubmit}
        onCancel={() => setElementModalOpen(false)}
        okText={editingElementId ? 'Save' : 'Create'}
        width={560}
        destroyOnClose
      >
        <Form form={elementForm} layout="vertical" requiredMark="optional">
          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, message: 'Name is required' }]}
          >
            <Input placeholder="e.g. BusinessCapability, ApplicationComponent" />
          </Form.Item>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="color" label="Color" style={{ flex: 1 }}>
              <ColorPicker format="hex" showText />
            </Form.Item>
            <Form.Item name="icon" label="Icon" style={{ flex: 1 }}>
              <Select
                options={DEFAULT_ICONS.map((i) => ({
                  value: i,
                  label: i,
                }))}
                placeholder="Select icon"
              />
            </Form.Item>
          </div>
          <Form.Item name="description" label="Description">
            <Input.TextArea placeholder="Describe this element type" rows={2} />
          </Form.Item>

          <Divider plain>Properties</Divider>
          <Form.List name="properties">
            {(fields, { add, remove }) => (
              <>
                {fields.map((field) => (
                  <div
                    key={field.key}
                    style={{
                      display: 'flex',
                      gap: 8,
                      marginBottom: 8,
                      alignItems: 'flex-start',
                    }}
                  >
                    <Form.Item
                      {...field}
                      name={[field.name, 'name']}
                      style={{ flex: 2, marginBottom: 0 }}
                      rules={[{ required: true, message: 'Name required' }]}
                    >
                      <Input placeholder="Property name" size="small" />
                    </Form.Item>
                    <Form.Item
                      {...field}
                      name={[field.name, 'type']}
                      style={{ flex: 1, marginBottom: 0 }}
                    >
                      <Select
                        size="small"
                        options={PROPERTY_TYPES.map((t) => ({
                          value: t,
                          label: t,
                        }))}
                        placeholder="Type"
                      />
                    </Form.Item>
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => remove(field.name)}
                    />
                  </div>
                ))}
                <Button
                  type="dashed"
                  onClick={() => add({ type: 'string' })}
                  block
                  icon={<PlusOutlined />}
                  size="small"
                >
                  Add Property
                </Button>
              </>
            )}
          </Form.List>
        </Form>
      </Modal>

      {/* ── Relationship Type Modal ── */}
      <Modal
        title="Create Relationship Type"
        open={relModalOpen}
        onOk={handleRelSubmit}
        onCancel={() => setRelModalOpen(false)}
        okText="Create"
        width={560}
        destroyOnClose
      >
        <Form form={relForm} layout="vertical" requiredMark="optional">
          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, message: 'Name is required' }]}
          >
            <Input placeholder="e.g. Realizes, DependsOn, Implements" />
          </Form.Item>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item
              name="sourceElementTypeId"
              label="Source Element Type"
              style={{ flex: 1 }}
              rules={[{ required: true, message: 'Required' }]}
            >
              <Select
                options={elementTypeOptions}
                placeholder="Select source"
              />
            </Form.Item>
            <Form.Item
              name="targetElementTypeId"
              label="Target Element Type"
              style={{ flex: 1 }}
              rules={[{ required: true, message: 'Required' }]}
            >
              <Select
                options={elementTypeOptions}
                placeholder="Select target"
              />
            </Form.Item>
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item
              name="arrowDirection"
              label="Arrow Direction"
              style={{ flex: 1 }}
            >
              <Select options={[...ARROW_DIRECTIONS]} />
            </Form.Item>
            <Form.Item name="lineStyle" label="Line Style" style={{ flex: 1 }}>
              <Select options={[...LINE_STYLES]} />
            </Form.Item>
          </div>
          <Form.Item name="color" label="Color">
            <ColorPicker format="hex" showText />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea
              placeholder="Describe this relationship type"
              rows={2}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ArchitectMetaModelEditor;
