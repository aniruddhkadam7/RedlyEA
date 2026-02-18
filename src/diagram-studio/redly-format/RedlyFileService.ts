/**
 * RedlyFileService — serialize, deserialize, export, and import .Redly files.
 *
 * This service is the single entry point for all .Redly file operations.
 * It has NO React dependency, NO DOM dependency (except for export/import
 * file download/upload helpers), and NO direct state mutation.
 *
 * Architecture:
 * - serializeView()   → ViewInstance + canvas state → RedlyFile
 * - deserializeView() → RedlyFile → { view: ViewInstance, positions, viewport }
 * - exportToFile()    → RedlyFile → triggers browser download
 * - importFromFile()  → File → RedlyFile (validated)
 * - importFromJson()  → JSON string → RedlyFile (validated)
 */

import type {
  ObjectType,
  RelationshipType,
} from '@/pages/dependency-view/utils/eaMetaModel';
import type {
  ViewLayoutPositions,
  ViewNodePosition,
} from '../view-runtime/ViewLayoutStore';
import type { ViewInstance } from '../viewpoints/ViewInstance';
import type {
  RedlyAnnotation,
  RedlyEdge,
  RedlyFile,
  RedlyMetadata,
  RedlyNode,
  RedlyScope,
} from './RedlyFileFormat';
import {
  REDLY_FILE_EXTENSION,
  REDLY_FORMAT_VERSION,
  REDLY_MAGIC,
  REDLY_MIME_TYPE,
  validateRedlyFile,
} from './RedlyFileFormat';

// ---------------------------------------------------------------------------
// §1: Types for serialization input
// ---------------------------------------------------------------------------

export type CanvasNodeData = {
  id: string;
  label: string;
  elementType: ObjectType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  properties?: Record<string, unknown>;
  freeShape?: boolean;
  freeShapeKind?: string;
};

export type CanvasEdgeData = {
  id: string;
  source: string;
  target: string;
  relationshipType: RelationshipType;
  properties?: Record<string, unknown>;
  freeConnector?: boolean;
  freeConnectorKind?: string;
};

export type CanvasState = {
  nodes: CanvasNodeData[];
  edges: CanvasEdgeData[];
  viewport: { zoom: number; pan: { x: number; y: number } };
};

export type SerializeViewInput = {
  view: ViewInstance;
  canvas: CanvasState;
  actor?: string;
};

// ---------------------------------------------------------------------------
// §2: Types for deserialization output
// ---------------------------------------------------------------------------

export type DeserializedView = {
  /** Reconstructed ViewInstance for the repository store. */
  view: ViewInstance;
  /** Per-node layout positions. */
  positions: ViewLayoutPositions;
  /** Viewport state (zoom & pan). */
  viewport: { zoom: number; pan: { x: number; y: number } };
  /** Free shapes to restore. */
  freeShapes: Array<{
    id: string;
    kind: string;
    label: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  /** Free connectors to restore. */
  freeConnectors: Array<{
    id: string;
    source: string;
    target: string;
    kind: string;
  }>;
  /** The raw .Redly file for reference. */
  redlyFile: RedlyFile;
};

// ---------------------------------------------------------------------------
// §3: Serialization — Canvas → .Redly
// ---------------------------------------------------------------------------

const buildRedlyNodes = (nodes: CanvasNodeData[]): RedlyNode[] =>
  nodes.map((n) => ({
    id: n.id,
    label: n.label,
    elementType: n.elementType,
    position: { x: n.x, y: n.y },
    ...(n.width != null && n.height != null
      ? { dimensions: { width: n.width, height: n.height } }
      : {}),
    ...(n.properties ? { properties: { ...n.properties } } : {}),
    ...(n.freeShape ? { freeShape: true } : {}),
    ...(n.freeShapeKind ? { freeShapeKind: n.freeShapeKind } : {}),
  }));

const buildRedlyEdges = (edges: CanvasEdgeData[]): RedlyEdge[] =>
  edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    relationshipType: e.relationshipType,
    ...(e.properties ? { properties: { ...e.properties } } : {}),
    ...(e.freeConnector ? { freeConnector: true } : {}),
    ...(e.freeConnectorKind ? { freeConnectorKind: e.freeConnectorKind } : {}),
  }));

const buildPositionsMap = (
  nodes: CanvasNodeData[],
): Record<string, { x: number; y: number }> => {
  const positions: Record<string, { x: number; y: number }> = {};
  for (const n of nodes) {
    positions[n.id] = { x: n.x, y: n.y };
  }
  return positions;
};

/**
 * Serialize a view + canvas state into a .Redly file object.
 */
export function serializeView(input: SerializeViewInput): RedlyFile {
  const { view, canvas, actor } = input;
  const now = new Date().toISOString();

  const scope: RedlyScope =
    view.scope?.kind === 'ManualSelection'
      ? {
          kind: 'ManualSelection',
          elementIds: [...(view.scope.elementIds ?? [])],
        }
      : { kind: 'EntireRepository' };

  const annotations: RedlyAnnotation[] = Array.isArray(
    (view.layoutMetadata as any)?.annotations,
  )
    ? ((view.layoutMetadata as any).annotations as RedlyAnnotation[])
    : [];

  const filters = (view.layoutMetadata as any)?.filters ?? undefined;
  const summary = (view.layoutMetadata as any)?.summary ?? undefined;

  const regularNodes = canvas.nodes.filter((n) => !n.freeShape);
  const visibleElementIds = regularNodes.map((n) => n.id);
  const regularEdges = canvas.edges.filter((e) => !e.freeConnector);
  const visibleRelationshipIds = regularEdges.map((e) => e.id);

  const metadata: RedlyMetadata = {
    viewpointId: view.viewpointId,
    scope,
    annotations: annotations.length > 0 ? annotations : undefined,
    filters,
    summary,
    visibleRelationshipIds,
    visibleElementIds,
  };

  const redlyFile: RedlyFile = {
    magic: REDLY_MAGIC,
    version: REDLY_FORMAT_VERSION,
    viewId: view.id,
    name: view.name,
    description: view.description ?? '',
    diagramType: view.viewpointId,
    createdAt: view.createdAt ?? now,
    updatedAt: now,
    createdBy: actor ?? view.createdBy ?? 'unknown',
    elements: {
      nodes: buildRedlyNodes(canvas.nodes),
      edges: buildRedlyEdges(canvas.edges),
    },
    layout: {
      positions: buildPositionsMap(canvas.nodes),
      viewport: {
        zoom: canvas.viewport.zoom,
        pan: { x: canvas.viewport.pan.x, y: canvas.viewport.pan.y },
      },
    },
    metadata,
  };

  return redlyFile;
}

// ---------------------------------------------------------------------------
// §4: Deserialization — .Redly → View + Canvas State
// ---------------------------------------------------------------------------

/**
 * Deserialize a validated .Redly file into a ViewInstance + layout data
 * ready to be injected into the Studio canvas.
 */
export function deserializeView(redlyFile: RedlyFile): DeserializedView {
  const nodes = redlyFile.elements.nodes;
  const edges = redlyFile.elements.edges;

  // Rebuild positions from the layout.positions map
  const positions: ViewLayoutPositions = {};
  for (const [id, pos] of Object.entries(redlyFile.layout.positions)) {
    const node = nodes.find((n) => n.id === id);
    const position: ViewNodePosition = {
      x: pos.x,
      y: pos.y,
      ...(node?.dimensions
        ? { width: node.dimensions.width, height: node.dimensions.height }
        : {}),
    };
    positions[id] = position;
  }

  // Also include any nodes that are in elements but not in positions
  for (const node of nodes) {
    if (!positions[node.id]) {
      positions[node.id] = {
        x: node.position.x,
        y: node.position.y,
        ...(node.dimensions
          ? { width: node.dimensions.width, height: node.dimensions.height }
          : {}),
      };
    }
  }

  // Rebuild viewport
  const viewport = {
    zoom: redlyFile.layout.viewport?.zoom ?? 1,
    pan: {
      x: redlyFile.layout.viewport?.pan?.x ?? 0,
      y: redlyFile.layout.viewport?.pan?.y ?? 0,
    },
  };

  // Extract free shapes
  const freeShapes = nodes
    .filter((n) => n.freeShape)
    .map((n) => ({
      id: n.id,
      kind: n.freeShapeKind ?? 'rectangle',
      label: n.label,
      x: n.position.x,
      y: n.position.y,
      width: n.dimensions?.width ?? 120,
      height: n.dimensions?.height ?? 80,
    }));

  // Extract free connectors
  const freeConnectors = edges
    .filter((e) => e.freeConnector)
    .map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      kind: e.freeConnectorKind ?? 'arrow',
    }));

  // Reconstruct scope
  const scope =
    redlyFile.metadata.scope?.kind === 'ManualSelection'
      ? {
          kind: 'ManualSelection' as const,
          elementIds: [...(redlyFile.metadata.scope.elementIds ?? [])],
        }
      : { kind: 'EntireRepository' as const };

  // Rebuild ViewInstance
  const view: ViewInstance = {
    id: redlyFile.viewId,
    name: redlyFile.name,
    description: redlyFile.description ?? '',
    viewpointId: redlyFile.metadata.viewpointId ?? redlyFile.diagramType,
    scope,
    layoutMetadata: {
      positions,
      freeShapes,
      freeConnectors,
      viewport,
      annotations: redlyFile.metadata.annotations
        ? [...redlyFile.metadata.annotations]
        : [],
      filters: redlyFile.metadata.filters ?? undefined,
      summary: redlyFile.metadata.summary ?? undefined,
      visibleElementIds: redlyFile.metadata.visibleElementIds
        ? [...redlyFile.metadata.visibleElementIds]
        : nodes.filter((n) => !n.freeShape).map((n) => n.id),
      visibleRelationshipIds: redlyFile.metadata.visibleRelationshipIds
        ? [...redlyFile.metadata.visibleRelationshipIds]
        : edges.filter((e) => !e.freeConnector).map((e) => e.id),
      workingView: false,
      lastSavedAt: redlyFile.updatedAt,
    },
    createdAt: redlyFile.createdAt,
    createdBy: redlyFile.createdBy,
    status: 'SAVED',
    visibleRelationshipIds: redlyFile.metadata.visibleRelationshipIds
      ? [...redlyFile.metadata.visibleRelationshipIds]
      : edges.filter((e) => !e.freeConnector).map((e) => e.id),
  };

  return {
    view,
    positions,
    viewport,
    freeShapes,
    freeConnectors,
    redlyFile,
  };
}

// ---------------------------------------------------------------------------
// §5: Export — .Redly → File Download
// ---------------------------------------------------------------------------

/**
 * Export a .Redly file as a downloadable file.
 */
export function exportRedlyFile(redlyFile: RedlyFile): void {
  const json = JSON.stringify(redlyFile, null, 2);
  const blob = new Blob([json], { type: REDLY_MIME_TYPE });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = sanitizeFilename(redlyFile.name) + REDLY_FILE_EXTENSION;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export a view directly (serialize + download in one step).
 */
export function exportViewAsRedly(input: SerializeViewInput): void {
  const redlyFile = serializeView(input);
  exportRedlyFile(redlyFile);
}

// ---------------------------------------------------------------------------
// §6: Import — File → .Redly
// ---------------------------------------------------------------------------

export type ImportResult =
  | { ok: true; data: DeserializedView }
  | { ok: false; errors: string[] };

/**
 * Import a .Redly file from a browser File object.
 * Returns a promise that resolves to the deserialized view data.
 */
export async function importRedlyFile(file: File): Promise<ImportResult> {
  try {
    const text = await file.text();
    return importRedlyFromJson(text);
  } catch (err) {
    return {
      ok: false,
      errors: [
        `Failed to read file: ${err instanceof Error ? err.message : String(err)}`,
      ],
    };
  }
}

/**
 * Import a .Redly file from a JSON string.
 */
export function importRedlyFromJson(json: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, errors: ['File content is not valid JSON.'] };
  }

  const validation = validateRedlyFile(parsed);
  if (!validation.valid) {
    return { ok: false, errors: [...validation.errors] };
  }

  try {
    const deserialized = deserializeView(validation.file);
    return { ok: true, data: deserialized };
  } catch (err) {
    return {
      ok: false,
      errors: [
        `Deserialization failed: ${err instanceof Error ? err.message : String(err)}`,
      ],
    };
  }
}

// ---------------------------------------------------------------------------
// §7: Utilities
// ---------------------------------------------------------------------------

/**
 * Sanitize a filename for safe file system use.
 */
function sanitizeFilename(name: string): string {
  return (name || 'Untitled View')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 200);
}

/**
 * Check if a filename has the .Redly extension.
 */
export function isRedlyFile(filename: string): boolean {
  return filename.toLowerCase().endsWith(REDLY_FILE_EXTENSION.toLowerCase());
}

/**
 * Generate a unique view ID for imported views (to avoid collisions).
 */
export function generateImportViewId(): string {
  const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
  return `view_${uuid}`;
}
