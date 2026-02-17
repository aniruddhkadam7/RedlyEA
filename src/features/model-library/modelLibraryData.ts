/**
 * Model Library data layer — sources from the **diagram element registry**
 * (EA_SHAPE_REGISTRY + EA_CONNECTOR_REGISTRY), the exact same dataset
 * that powered the Toolbox panel in StudioShell.
 *
 * NO metamodel definitions. NO ArchiMate documentation catalog.
 * Only real, canvas-placeable diagram primitives.
 */
import type { EaLayer, ObjectType, RelationshipType } from '@/pages/dependency-view/utils/eaMetaModel';
import {
  EA_SHAPE_REGISTRY,
  EA_CONNECTOR_REGISTRY,
} from '@/ea/archimateShapeRegistry';

// ---------------------------------------------------------------------------
// Tab key
// ---------------------------------------------------------------------------
export type ModelLibraryTabKey =
  | 'components'
  | 'nodes'
  | 'connections'
  | 'connectors';

// ---------------------------------------------------------------------------
// Element item — mirrors EA_VISUALS shape used by the old Toolbox
// ---------------------------------------------------------------------------
export interface ElementCatalogItem {
  kind: string;
  type: ObjectType;
  layer: EaLayer;
  label: string;
  /** Resolved SVG path (same URL the canvas uses) */
  icon: string;
  category: 'components' | 'nodes';
}

// ---------------------------------------------------------------------------
// Relationship item — mirrors paletteRelationships from StudioShell
// ---------------------------------------------------------------------------
export interface RelationshipCatalogItem {
  type: RelationshipType;
  layer: EaLayer;
  label: string;
  /** SVG data-URI for the toolbox icon */
  icon: string;
  category: 'connections' | 'connectors';
}

export type CatalogItem = ElementCatalogItem | RelationshipCatalogItem;

// ---------------------------------------------------------------------------
// Relationship icon builder (replicated from StudioShell — kept
// self-contained so we don't couple to the 16 000-line component)
// ---------------------------------------------------------------------------
const buildSvgIcon = (svg: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

type RelationshipStyle = 'directed' | 'dependency' | 'association' | 'flow';

const RELATIONSHIP_STYLE_BY_TYPE: Partial<Record<RelationshipType, RelationshipStyle>> = {
  DEPENDS_ON: 'dependency',
  USES: 'dependency',
  INTEGRATES_WITH: 'association',
  CONNECTS_TO: 'association',
  OWNS: 'association',
  HAS: 'association',
  REALIZES: 'directed',
  REALIZED_BY: 'directed',
  SERVED_BY: 'directed',
  EXPOSES: 'directed',
  PROVIDED_BY: 'directed',
  USED_BY: 'directed',
  SUPPORTS: 'directed',
  DEPLOYED_ON: 'flow',
  TRIGGERS: 'flow',
  CONSUMES: 'flow',
  DECOMPOSES_TO: 'association',
  COMPOSED_OF: 'association',
  DELIVERS: 'flow',
  IMPLEMENTS: 'directed',
  IMPACTS: 'flow',
};

const RELATIONSHIP_SHORT_LABELS: Partial<Record<RelationshipType, string>> = {
  SERVED_BY: 'S',
  USES: 'U',
  REALIZES: 'R',
  REALIZED_BY: 'RB',
  DEPLOYED_ON: 'D',
  CONNECTS_TO: 'C',
  INTEGRATES_WITH: 'I',
  OWNS: 'O',
  HAS: 'H',
  TRIGGERS: 'T',
  EXPOSES: 'E',
  PROVIDED_BY: 'P',
  USED_BY: 'UB',
  SUPPORTS: 'SP',
  DEPENDS_ON: 'DP',
  CONSUMES: 'CN',
  COMPOSED_OF: 'CO',
  DECOMPOSES_TO: 'DC',
  DELIVERS: 'DL',
  IMPLEMENTS: 'IM',
  IMPACTS: 'IA',
  SUPPORTED_BY: 'SB',
};

function buildRelationshipSvgIcon(
  type: RelationshipType,
  variant: 'tool' | 'connector',
): string {
  const shortLabel = RELATIONSHIP_SHORT_LABELS[type] || type.slice(0, 2);
  const style: RelationshipStyle = RELATIONSHIP_STYLE_BY_TYPE[type] ?? 'directed';
  const strokeDash = style === 'dependency' ? '4 2' : style === 'flow' ? '1 2' : '0';
  const arrow = style === 'association'
    ? ''
    : '<polygon points="12,4 15,8 12,12" fill="#434343"/>';
  const textSize = shortLabel.length > 2 ? 14 : 18;
  return buildSvgIcon(
    `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><line x1="6" y1="24" x2="36" y2="24" stroke="#434343" stroke-width="3" stroke-dasharray="${strokeDash === '0' ? '0' : strokeDash === '4 2' ? '8 4' : '3 5'}"/>${arrow === '' ? '' : '<polygon points="36,14 44,24 36,34" fill="#434343"/>'}<text x="6" y="18" font-size="${textSize}" fill="#434343" font-family="Arial" font-weight="700">${shortLabel}</text>${variant === 'connector' ? '<circle cx="6" cy="24" r="3" fill="#434343"/>' : ''}</svg>`,
  );
}

// ---------------------------------------------------------------------------
// Catalog loaders — filter the real registry, same logic as StudioShell
// ---------------------------------------------------------------------------

/** Components tab — non-Technology elements from EA_SHAPE_REGISTRY */
export function loadComponents(): ElementCatalogItem[] {
  return EA_SHAPE_REGISTRY
    .filter((entry) => entry.layer !== 'Technology')
    .map((entry) => ({
      kind: entry.kind,
      type: entry.type,
      layer: entry.layer,
      label: entry.label,
      icon: entry.svgPath,
      category: 'components' as const,
    }));
}

/** Nodes tab — Technology-layer elements from EA_SHAPE_REGISTRY */
export function loadNodes(): ElementCatalogItem[] {
  return EA_SHAPE_REGISTRY
    .filter((entry) => entry.layer === 'Technology')
    .map((entry) => ({
      kind: entry.kind,
      type: entry.type,
      layer: entry.layer,
      label: entry.label,
      icon: entry.svgPath,
      category: 'nodes' as const,
    }));
}

/** Connections tab — relationship types (tool style icons) */
export function loadConnections(): RelationshipCatalogItem[] {
  return EA_CONNECTOR_REGISTRY.map((def) => ({
    type: def.type as RelationshipType,
    layer: def.layer,
    label: def.type.replace(/_/g, ' '),
    icon: buildRelationshipSvgIcon(def.type as RelationshipType, 'tool'),
    category: 'connections' as const,
  }));
}

/** Connectors tab — same relationships, connector-style icons */
export function loadConnectors(): RelationshipCatalogItem[] {
  return EA_CONNECTOR_REGISTRY.map((def) => ({
    type: def.type as RelationshipType,
    layer: def.layer,
    label: def.type.replace(/_/g, ' '),
    icon: buildRelationshipSvgIcon(def.type as RelationshipType, 'connector'),
    category: 'connectors' as const,
  }));
}

/** Load all items for a given tab */
export function loadCatalogForTab(tab: ModelLibraryTabKey): CatalogItem[] {
  switch (tab) {
    case 'components':
      return loadComponents();
    case 'nodes':
      return loadNodes();
    case 'connections':
      return loadConnections();
    case 'connectors':
      return loadConnectors();
  }
}
