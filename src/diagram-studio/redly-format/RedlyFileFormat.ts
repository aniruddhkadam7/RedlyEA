/**
 * RedlyFileFormat — canonical type definitions for the .Redly view file format.
 *
 * A .Redly file is a JSON-based, fully serialized diagram state that can be:
 * - Saved to and loaded from the repository
 * - Exported as a standalone file
 * - Imported to restore an exact diagram
 * - Shared between users and instances
 *
 * The file extension is `.Redly` and the MIME type is `application/x-redly`.
 */

import type {
  ObjectType,
  RelationshipType,
} from '@/pages/dependency-view/utils/eaMetaModel';

// ---------------------------------------------------------------------------
// §1: Core Types
// ---------------------------------------------------------------------------

/** Current schema version for .Redly files. */
export const REDLY_FORMAT_VERSION = 1;

/** File extension (with dot). */
export const REDLY_FILE_EXTENSION = '.Redly';

/** MIME type for .Redly files. */
export const REDLY_MIME_TYPE = 'application/x-redly';

/** Magic header for validation. */
export const REDLY_MAGIC = 'REDLY_VIEW_FILE';

// ---------------------------------------------------------------------------
// §2: Node & Edge definitions
// ---------------------------------------------------------------------------

export type RedlyNode = {
  /** Unique identifier for this node (matches repository element ID). */
  readonly id: string;
  /** Display label. */
  readonly label: string;
  /** ArchiMate / EA element type. */
  readonly elementType: ObjectType;
  /** Canvas position. */
  readonly position: { readonly x: number; readonly y: number };
  /** Optional dimensions (for resizable nodes). */
  readonly dimensions?: { readonly width: number; readonly height: number };
  /** Element properties/attributes from the repository. */
  readonly properties?: Readonly<Record<string, unknown>>;
  /** Whether this is a free-form shape (not tied to a repository element). */
  readonly freeShape?: boolean;
  /** Kind of free shape (note, group, boundary, etc.). */
  readonly freeShapeKind?: string;
};

export type RedlyEdge = {
  /** Unique identifier for this edge (matches repository relationship ID). */
  readonly id: string;
  /** Source node ID. */
  readonly source: string;
  /** Target node ID. */
  readonly target: string;
  /** Relationship type. */
  readonly relationshipType: RelationshipType;
  /** Edge properties/attributes. */
  readonly properties?: Readonly<Record<string, unknown>>;
  /** Whether this is a free-form connector (not tied to a repository relationship). */
  readonly freeConnector?: boolean;
  /** Kind of free connector. */
  readonly freeConnectorKind?: string;
};

// ---------------------------------------------------------------------------
// §3: Layout
// ---------------------------------------------------------------------------

export type RedlyViewport = {
  /** Zoom level (1.0 = 100%). */
  readonly zoom: number;
  /** Pan offset. */
  readonly pan: { readonly x: number; readonly y: number };
};

export type RedlyLayout = {
  /** Per-node positions keyed by node ID. */
  readonly positions: Readonly<
    Record<string, { readonly x: number; readonly y: number }>
  >;
  /** Viewport state (zoom & pan). */
  readonly viewport: RedlyViewport;
};

// ---------------------------------------------------------------------------
// §4: Metadata
// ---------------------------------------------------------------------------

export type RedlyMetadata = {
  /** Viewpoint ID that governs this view's element/relationship types. */
  readonly viewpointId: string;
  /** View scope definition. */
  readonly scope: RedlyScope;
  /** Annotations (notes, callouts, highlights). */
  readonly annotations?: readonly RedlyAnnotation[];
  /** Filters applied to the view. */
  readonly filters?: Readonly<Record<string, unknown>>;
  /** Summary / description notes. */
  readonly summary?: Readonly<Record<string, unknown>>;
  /** IDs of relationships explicitly visible in this view. */
  readonly visibleRelationshipIds?: readonly string[];
  /** IDs of elements explicitly visible in this view. */
  readonly visibleElementIds?: readonly string[];
  /** Additional forward-compatible metadata. */
  readonly [key: string]: unknown;
};

export type RedlyScope =
  | { readonly kind: 'EntireRepository' }
  | {
      readonly kind: 'ManualSelection';
      readonly elementIds: readonly string[];
    };

export type RedlyAnnotation = {
  readonly id: string;
  readonly kind: 'note' | 'callout' | 'highlight';
  readonly text: string;
  readonly targetElementId?: string;
  readonly createdAt: string;
  readonly createdBy?: string;
};

// ---------------------------------------------------------------------------
// §5: The .Redly File — top-level structure
// ---------------------------------------------------------------------------

export type RedlyFile = {
  /** Magic header for file identification. */
  readonly magic: typeof REDLY_MAGIC;
  /** Schema version for backward compatibility. */
  readonly version: typeof REDLY_FORMAT_VERSION;
  /** Unique view identifier. */
  readonly viewId: string;
  /** Human-readable view name. */
  readonly name: string;
  /** Optional description. */
  readonly description: string;
  /** Diagram type / viewpoint classification. */
  readonly diagramType: string;
  /** ISO-8601 creation timestamp. */
  readonly createdAt: string;
  /** ISO-8601 last-updated timestamp. */
  readonly updatedAt: string;
  /** Who created / last saved. */
  readonly createdBy: string;
  /** Full element (node) data. */
  readonly elements: {
    readonly nodes: readonly RedlyNode[];
    readonly edges: readonly RedlyEdge[];
  };
  /** Layout & viewport state. */
  readonly layout: RedlyLayout;
  /** View metadata (viewpoint, scope, annotations, etc.). */
  readonly metadata: RedlyMetadata;
};

// ---------------------------------------------------------------------------
// §6: Validation
// ---------------------------------------------------------------------------

export type RedlyValidationResult =
  | { readonly valid: true; readonly file: RedlyFile }
  | { readonly valid: false; readonly errors: readonly string[] };

/**
 * Validate and parse a raw JSON object as a .Redly file.
 * Returns either a validated RedlyFile or a list of validation errors.
 */
export function validateRedlyFile(raw: unknown): RedlyValidationResult {
  const errors: string[] = [];

  if (!raw || typeof raw !== 'object') {
    return { valid: false, errors: ['Input is not a valid object.'] };
  }

  const obj = raw as Record<string, unknown>;

  // Magic header
  if (obj.magic !== REDLY_MAGIC) {
    errors.push(`Missing or invalid magic header. Expected "${REDLY_MAGIC}".`);
  }

  // Version
  if (typeof obj.version !== 'number' || obj.version < 1) {
    errors.push('Missing or invalid version number.');
  }

  // Required string fields
  for (const field of [
    'viewId',
    'name',
    'createdAt',
    'updatedAt',
    'createdBy',
  ] as const) {
    if (typeof obj[field] !== 'string' || !(obj[field] as string).trim()) {
      errors.push(`Missing or empty required field: "${field}".`);
    }
  }

  // Elements
  const elements = obj.elements as Record<string, unknown> | undefined;
  if (!elements || typeof elements !== 'object') {
    errors.push('Missing "elements" object.');
  } else {
    if (!Array.isArray(elements.nodes)) {
      errors.push('"elements.nodes" must be an array.');
    }
    if (!Array.isArray(elements.edges)) {
      errors.push('"elements.edges" must be an array.');
    }
  }

  // Layout
  const layout = obj.layout as Record<string, unknown> | undefined;
  if (!layout || typeof layout !== 'object') {
    errors.push('Missing "layout" object.');
  } else {
    if (!layout.positions || typeof layout.positions !== 'object') {
      errors.push('"layout.positions" must be an object.');
    }
    const viewport = layout.viewport as Record<string, unknown> | undefined;
    if (!viewport || typeof viewport !== 'object') {
      errors.push('"layout.viewport" must be an object with zoom and pan.');
    } else {
      if (typeof viewport.zoom !== 'number') {
        errors.push('"layout.viewport.zoom" must be a number.');
      }
      if (!viewport.pan || typeof viewport.pan !== 'object') {
        errors.push('"layout.viewport.pan" must be an object with x and y.');
      }
    }
  }

  // Metadata
  if (!obj.metadata || typeof obj.metadata !== 'object') {
    errors.push('Missing "metadata" object.');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, file: obj as unknown as RedlyFile };
}
