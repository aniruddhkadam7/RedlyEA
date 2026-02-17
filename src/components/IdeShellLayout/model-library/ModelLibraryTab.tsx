/**
 * ModelLibraryTab — full-page workspace tab that replaces the old Toolbox.
 *
 * Sources items from the **diagram element registry** (EA_SHAPE_REGISTRY
 * + EA_CONNECTOR_REGISTRY) — the same dataset used by the Toolbox panel
 * in StudioShell.
 *
 * Layout:
 *   ┌───────────┬───────────┬─────────────┬────────────┐
 *   │Components │  Nodes    │ Connections  │ Connectors │
 *   └───────────┴───────────┴─────────────┴────────────┘
 *   │                                                    │
 *   │   Draggable cards with real SVG previews           │
 *   │   (+) button for quick-add to active diagram       │
 *   │                                                    │
 *   └────────────────────────────────────────────────────┘
 */
import { Empty, Input, Tabs, Typography, message, theme } from 'antd';
import React, { useCallback, useMemo, useState } from 'react';

import type {
  CatalogItem,
  ModelLibraryTabKey,
} from '@/features/model-library/modelLibraryData';
import { loadCatalogForTab } from '@/features/model-library/modelLibraryData';
import ModelLibraryCard, { isElementItem } from './ModelLibraryCard';

const { Title, Text } = Typography;
const { Search } = Input;

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------
const TAB_KEYS: { key: ModelLibraryTabKey; label: string }[] = [
  { key: 'components', label: 'Components' },
  { key: 'nodes', label: 'Nodes' },
  { key: 'connections', label: 'Connections' },
  { key: 'connectors', label: 'Connectors' },
];

// ---------------------------------------------------------------------------
// Unique key for a catalog item
// ---------------------------------------------------------------------------
function itemKey(item: CatalogItem): string {
  if (isElementItem(item)) return item.kind;
  return `${item.category}:${item.type}`;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
const ModelLibraryTab: React.FC = () => {
  const { token } = theme.useToken();

  const [activeTab, setActiveTab] = useState<ModelLibraryTabKey>('components');
  const [search, setSearch] = useState('');

  // Source items from the real diagram element registry
  const items = useMemo(() => loadCatalogForTab(activeTab), [activeTab]);

  // Filtered items
  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const lower = search.toLowerCase();
    return items.filter(
      (it) =>
        it.label.toLowerCase().includes(lower) ||
        it.layer.toLowerCase().includes(lower),
    );
  }, [items, search]);

  const handleTabChange = useCallback((key: string) => {
    setActiveTab(key as ModelLibraryTabKey);
    setSearch('');
  }, []);

  // (+) quick-add handler — places element at canvas center if diagram is open
  const handleQuickAdd = useCallback((item: CatalogItem) => {
    // The diagram canvas lives in StudioShell which reads from pendingElementType /
    // pendingRelationshipType state. Since Model Library is a separate workspace tab
    // and may not have a diagram open, we show the appropriate message.
    message.info('Open or create a diagram first, then drag an element onto the canvas.');
  }, []);

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: token.colorBgContainer,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px 24px 0',
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        <Title level={4} style={{ marginBottom: 4 }}>
          Model Library
        </Title>
        <Text type="secondary" style={{ fontSize: 13 }}>
          Drag an element onto a diagram to add it. Components &amp; nodes create
          repository objects; connections define relationships.
        </Text>

        {/* Tabs + search */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 12,
          }}
        >
          <Tabs
            activeKey={activeTab}
            onChange={handleTabChange}
            style={{ marginBottom: 0 }}
            items={TAB_KEYS.map((t) => ({ key: t.key, label: t.label }))}
          />
          <Search
            placeholder="Filter…"
            allowClear
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 220 }}
            size="small"
          />
        </div>
      </div>

      {/* Card grid */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '16px 24px 24px',
        }}
      >
        {filtered.length === 0 ? (
          <Empty
            description={
              search ? 'No items match your filter' : 'No items in this category'
            }
            style={{ marginTop: 48 }}
          />
        ) : (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              alignContent: 'flex-start',
            }}
          >
            {filtered.map((item) => (
              <ModelLibraryCard
                key={itemKey(item)}
                item={item}
                onQuickAdd={handleQuickAdd}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(ModelLibraryTab);
