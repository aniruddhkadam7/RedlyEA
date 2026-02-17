/**
 * ModelLibraryCard — draggable card that renders the **actual SVG preview**
 * of a diagram element, exactly as it appears on the canvas.
 *
 * Layout:
 *   ┌──────────────────────┐
 *   │                   [+]│  ← plus button (top-right)
 *   │     <SVG preview>    │  ← real shape icon
 *   │                      │
 *   │   Element Name       │  ← label
 *   │   Layer badge        │  ← small layer/category text
 *   └──────────────────────┘
 *
 * Drag transfer uses the same MIME types as the old Toolbox:
 *   application/x-ea-element-type  + application/x-ea-visual-kind   (elements)
 *   application/x-ea-relationship-type                               (connections)
 */
import { PlusOutlined } from '@ant-design/icons';
import { Button, Tooltip, Typography, message, theme } from 'antd';
import React, { useCallback } from 'react';
import type {
  CatalogItem,
  ElementCatalogItem,
  RelationshipCatalogItem,
} from '@/features/model-library/modelLibraryData';

const { Text } = Typography;

// ---------------------------------------------------------------------------
// Layer → colour mapping (matches StudioShell)
// ---------------------------------------------------------------------------
const LAYER_COLOR: Record<string, string> = {
  Business: '#95de64',
  Application: '#69b1ff',
  Technology: '#ffd666',
  'Implementation & Migration': '#ff9c6e',
  Governance: '#b37feb',
};

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------
export function isElementItem(item: CatalogItem): item is ElementCatalogItem {
  return 'kind' in item;
}
function isRelationshipItem(item: CatalogItem): item is RelationshipCatalogItem {
  return 'type' in item && !('kind' in item);
}

// ---------------------------------------------------------------------------
// Card component
// ---------------------------------------------------------------------------
interface ModelLibraryCardProps {
  item: CatalogItem;
  /** Called when the (+) button is clicked */
  onQuickAdd?: (item: CatalogItem) => void;
}

const ModelLibraryCard: React.FC<ModelLibraryCardProps> = ({ item, onQuickAdd }) => {
  const { token } = theme.useToken();
  const layerColor = LAYER_COLOR[item.layer] ?? '#d9d9d9';

  // ── Drag ──────────────────────────────────────────────────────────────
  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      if (isElementItem(item)) {
        // Same MIME types the old Toolbox used → StudioShell canvas already handles these
        e.dataTransfer.setData('application/x-ea-element-type', item.type);
        e.dataTransfer.setData('application/x-ea-visual-kind', item.kind);
        e.dataTransfer.setData('text/plain', item.type);
      } else if (isRelationshipItem(item)) {
        e.dataTransfer.setData('application/x-ea-relationship-type', item.type);
        e.dataTransfer.setData('text/plain', item.type);
      }
      e.dataTransfer.effectAllowed = 'copy';
    },
    [item],
  );

  // ── (+) button ────────────────────────────────────────────────────────
  const handleQuickAdd = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onQuickAdd?.(item);
    },
    [item, onQuickAdd],
  );

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      style={{
        width: 140,
        background: token.colorBgContainer,
        border: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: token.borderRadiusLG,
        padding: 10,
        cursor: 'grab',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        position: 'relative',
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = token.colorPrimary;
        (e.currentTarget as HTMLDivElement).style.boxShadow = `0 0 0 1px ${token.colorPrimaryBorder}`;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = token.colorBorderSecondary;
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
      }}
    >
      {/* (+) quick-add button — top right */}
      <Tooltip title="Add to diagram">
        <Button
          type="text"
          size="small"
          icon={<PlusOutlined />}
          onClick={handleQuickAdd}
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            width: 22,
            height: 22,
            minWidth: 22,
            padding: 0,
            fontSize: 12,
            color: token.colorTextSecondary,
          }}
          aria-label={`Add ${item.label}`}
        />
      </Tooltip>

      {/* SVG preview — the actual shape icon */}
      <div
        style={{
          width: 48,
          height: 48,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 8,
        }}
      >
        <img
          src={
            typeof item.icon === 'string' && item.icon
              ? item.icon.startsWith('data:')
                ? item.icon
                : encodeURI(item.icon)
              : undefined
          }
          alt={item.label}
          draggable={false}
          width={48}
          height={48}
          style={{ objectFit: 'contain' }}
          onError={(e) => {
            // Hide broken image, will show fallback letter below
            e.currentTarget.style.display = 'none';
          }}
        />
      </div>

      {/* Element name */}
      <Text
        strong
        ellipsis
        style={{
          display: 'block',
          width: '100%',
          textAlign: 'center',
          fontSize: 12,
          lineHeight: '16px',
        }}
      >
        {item.label}
      </Text>

      {/* Layer badge */}
      <Text
        style={{
          fontSize: 10,
          color: token.colorTextSecondary,
          background: layerColor + '33', // 20% opacity
          padding: '1px 6px',
          borderRadius: 3,
          lineHeight: '14px',
        }}
      >
        {item.layer}
      </Text>
    </div>
  );
};

export default React.memo(ModelLibraryCard);
