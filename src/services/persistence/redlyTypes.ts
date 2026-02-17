/**
 * Redly File Format — Type Definitions
 *
 * The `.Redly` file is a ZIP container with the following internal structure:
 *
 *   .Redly
 *   ├── metadata.json         — format version, timestamps, app version
 *   ├── repository.json       — all elements + relationships (single source of truth)
 *   ├── diagrams/
 *   │   ├── <viewId>.json     — per-view diagram definitions
 *   │   └── ...
 *   ├── layouts/
 *   │   ├── <viewId>.layout.json — per-view element positions
 *   │   └── ...
 *   └── assets/               — reserved for future use
 *
 * Design principles:
 * - Repository is the SINGLE SOURCE OF TRUTH.
 * - Diagrams are projections of repository data.
 * - Analysis is NEVER stored; it is recomputed on load.
 * - Versioning is built in from day one via `formatVersion`.
 */

// ---------------------------------------------------------------------------
// Redly metadata.json
// ---------------------------------------------------------------------------

/** Current format version. Bump on breaking changes to the `.Redly` structure. */
export const REDLY_FORMAT_VERSION = '1.0.0';

export type RedlyMetadata = {
  /** Semantic version of the `.Redly` container format. */
  formatVersion: string;
  /** ISO-8601 timestamp when the file was originally created. */
  createdAt: string;
  /** ISO-8601 timestamp of the most recent save. */
  updatedAt: string;
  /** Version of the Redly application that created this file. */
  appVersion: string;
  /** Schema version of the repository data model. */
  schemaVersion: string;
  /** SHA-256 checksum of repository.json for integrity verification. */
  checksum: string;
};

// ---------------------------------------------------------------------------
// repository.json
// ---------------------------------------------------------------------------

export type RedlyElement = {
  id: string;
  type: string;
  workspaceId?: string;
  attributes: Record<string, unknown>;
};

export type RedlyRelationship = {
  id: string;
  fromId: string;
  toId: string;
  type: string;
  attributes: Record<string, unknown>;
};

export type RedlyRepositoryData = {
  metadata: Record<string, unknown>;
  objects: RedlyElement[];
  relationships: RedlyRelationship[];
  /** Design workspaces (staged changes). */
  designWorkspaces: unknown[];
  /** Baseline snapshots. */
  baselines: unknown[];
  /** Import history records. */
  importHistory: unknown[];
  /** Version history records. */
  versionHistory: unknown[];
};

// ---------------------------------------------------------------------------
// diagrams/<viewId>.json
// ---------------------------------------------------------------------------

export type RedlyDiagramData = {
  id: string;
  name: string;
  description: string;
  viewpointId: string;
  scope: unknown;
  layoutMetadata: Record<string, unknown>;
  createdAt: string;
  createdBy: string;
  status: string;
  visibleRelationshipIds?: readonly string[];
};

// ---------------------------------------------------------------------------
// layouts/<viewId>.layout.json
// ---------------------------------------------------------------------------

export type RedlyLayoutPosition = {
  x: number;
  y: number;
  width?: number;
  height?: number;
};

export type RedlyLayoutData = Record<string, RedlyLayoutPosition>;

// ---------------------------------------------------------------------------
// Full package (in-memory representation before/after ZIP)
// ---------------------------------------------------------------------------

export type RedlyPackage = {
  metadata: RedlyMetadata;
  repository: RedlyRepositoryData;
  diagrams: RedlyDiagramData[];
  layouts: Record<string, RedlyLayoutData>;
};

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type RedlyExportResult =
  | { ok: true; bytes: Uint8Array; metadata: RedlyMetadata }
  | { ok: false; error: string };

export type RedlyImportResult =
  | { ok: true; data: RedlyPackage; warnings: string[] }
  | { ok: false; error: string };

export type RedlyValidationResult =
  | { ok: true; warnings: string[] }
  | { ok: false; errors: string[] };
