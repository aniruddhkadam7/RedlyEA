/**
 * Redly Export Service
 *
 * Builds a `.Redly` ZIP file from the current in-memory repository state.
 *
 * Flow:
 * 1. Collect all data from EaRepository, ViewStore, ViewLayoutStore, DesignWorkspaceStore.
 * 2. Validate referential integrity — block save if errors exist.
 * 3. Serialize into the Redly ZIP structure.
 * 4. Return bytes for download or Electron IPC.
 *
 * Does NOT store:
 * - Analysis cache (recomputed on load)
 * - Canvas-only transient state
 */

import { zipSync } from 'fflate';
import {
  redlyJsonToBytes,
  redlySha256Hex,
  redlyVerifyZipHeader,
} from './redlyPackageUtils';
import {
  REDLY_FORMAT_VERSION,
  type RedlyDiagramData,
  type RedlyElement,
  type RedlyExportResult,
  type RedlyLayoutData,
  type RedlyMetadata,
  type RedlyPackage,
  type RedlyRelationship,
  type RedlyRepositoryData,
} from './redlyTypes';
import { validateRepositoryData } from './redlyValidation';

/** DEFLATE compression level for ZIP entries. */
const ZIP_DEFLATE_LEVEL = 6;

/** Application version — read from package.json at build time or fallback. */
const APP_VERSION: string =
  typeof process !== 'undefined' && (process.env as Record<string, string>).APP_VERSION
    ? (process.env as Record<string, string>).APP_VERSION!
    : '6.0.0';

// ---------------------------------------------------------------------------
// Source data — what the caller must provide
// ---------------------------------------------------------------------------

export type RedlyExportSource = {
  /** Repository metadata (org name, scope, framework, etc.). */
  repositoryMetadata: Record<string, unknown>;
  /** All elements in the repository. */
  objects: RedlyElement[];
  /** All relationships in the repository. */
  relationships: RedlyRelationship[];
  /** All view/diagram definitions. */
  views: RedlyDiagramData[];
  /** Layout positions keyed by view ID → element ID → position. */
  viewLayouts: Record<string, RedlyLayoutData>;
  /** Design workspaces (staged changes). */
  designWorkspaces: unknown[];
  /** Baseline snapshots. */
  baselines: unknown[];
  /** Import history entries. */
  importHistory: unknown[];
  /** Version history entries. */
  versionHistory: unknown[];
  /** Schema version string. */
  schemaVersion?: string;
};

// ---------------------------------------------------------------------------
// Build the in-memory package
// ---------------------------------------------------------------------------

const buildRepositoryJson = (
  source: RedlyExportSource,
): RedlyRepositoryData => ({
  metadata: { ...source.repositoryMetadata },
  objects: source.objects.map((o) => ({
    id: o.id,
    type: o.type,
    workspaceId: o.workspaceId,
    attributes: { ...(o.attributes ?? {}) },
  })),
  relationships: source.relationships.map((r) => ({
    id: r.id,
    fromId: r.fromId,
    toId: r.toId,
    type: r.type,
    attributes: { ...(r.attributes ?? {}) },
  })),
  designWorkspaces: source.designWorkspaces ?? [],
  baselines: source.baselines ?? [],
  importHistory: source.importHistory ?? [],
  versionHistory: source.versionHistory ?? [],
});

// ---------------------------------------------------------------------------
// Build the ZIP archive
// ---------------------------------------------------------------------------

const buildRedlyZip = async (
  pkg: RedlyPackage,
): Promise<Uint8Array> => {
  const opt = { level: ZIP_DEFLATE_LEVEL } as const;

  // Build individual diagram and layout files keyed by viewId
  const diagramEntries: Record<string, [Uint8Array, { level: number }]> = {};
  for (const diagram of pkg.diagrams) {
    diagramEntries[`${diagram.id}.json`] = [redlyJsonToBytes(diagram), opt];
  }

  const layoutEntries: Record<string, [Uint8Array, { level: number }]> = {};
  for (const [viewId, positions] of Object.entries(pkg.layouts)) {
    layoutEntries[`${viewId}.layout.json`] = [redlyJsonToBytes(positions), opt];
  }

  const archive = zipSync({
    'metadata.json': [redlyJsonToBytes(pkg.metadata), opt],
    'repository.json': [redlyJsonToBytes(pkg.repository), opt],
    diagrams: diagramEntries as any,
    layouts: layoutEntries as any,
  });

  redlyVerifyZipHeader(archive);
  return archive;
};

// ---------------------------------------------------------------------------
// Export summary log
// ---------------------------------------------------------------------------

const logExportSummary = (
  metadata: RedlyMetadata,
  elementCount: number,
  relationshipCount: number,
  diagramCount: number,
  layoutCount: number,
  warnings: string[],
): void => {
  const border = '═'.repeat(52);
  console.log(`\n╔${border}╗`);
  console.log(`║  Redly Export Summary                              ║`);
  console.log(`╠${border}╣`);
  console.log(
    `║  Elements:           ${String(elementCount).padStart(8)}                   ║`,
  );
  console.log(
    `║  Relationships:      ${String(relationshipCount).padStart(8)}                   ║`,
  );
  console.log(
    `║  Diagrams:           ${String(diagramCount).padStart(8)}                   ║`,
  );
  console.log(
    `║  Layouts:            ${String(layoutCount).padStart(8)}                   ║`,
  );
  console.log(`╠${border}╣`);
  console.log(
    `║  Format:  v${metadata.formatVersion.padEnd(8)}  App: ${metadata.appVersion.padEnd(13)}    ║`,
  );
  console.log(
    `║  Date:    ${metadata.updatedAt.slice(0, 19).padEnd(25)}              ║`,
  );
  console.log(
    `║  Checksum: ${metadata.checksum.slice(0, 16)}…                    ║`,
  );
  if (warnings.length > 0) {
    console.log(`╠${border}╣`);
    console.log(
      `║  ⚠ ${warnings.length} validation warning(s)                        ║`,
    );
  }
  console.log(`╚${border}╝\n`);
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a `.Redly` file from the given source data.
 *
 * Steps:
 * 1. Validate referential integrity (block save on errors).
 * 2. Serialize repository, diagrams, and layouts.
 * 3. Compute SHA-256 checksum over repository.json.
 * 4. Package into a ZIP container.
 *
 * @returns `{ ok: true, bytes, metadata }` on success, `{ ok: false, error }` on failure.
 */
export const buildRedlyFile = async (
  source: RedlyExportSource,
): Promise<RedlyExportResult> => {
  try {
    // --- Step 1: Validate ---
    const validation = validateRepositoryData({
      objects: source.objects,
      relationships: source.relationships,
      diagrams: source.views,
      layouts: source.viewLayouts,
    });

    if (!validation.ok) {
      return {
        ok: false,
        error:
          'Repository integrity check failed. Cannot save.\n\n' +
          validation.errors.join('\n'),
      };
    }

    // --- Step 2: Build repository data ---
    const repositoryData = buildRepositoryJson(source);
    const repositoryBytes = redlyJsonToBytes(repositoryData);

    // --- Step 3: Compute checksum ---
    const checksum = await redlySha256Hex(repositoryBytes);

    // --- Step 4: Build metadata ---
    const now = new Date().toISOString();
    const metadata: RedlyMetadata = {
      formatVersion: REDLY_FORMAT_VERSION,
      createdAt: now,
      updatedAt: now,
      appVersion: APP_VERSION,
      schemaVersion: source.schemaVersion ?? '1',
      checksum,
    };

    // --- Step 5: Build package ---
    const pkg: RedlyPackage = {
      metadata,
      repository: repositoryData,
      diagrams: source.views,
      layouts: source.viewLayouts,
    };

    // --- Step 6: Build ZIP ---
    const bytes = await buildRedlyZip(pkg);

    // --- Log summary ---
    logExportSummary(
      metadata,
      source.objects.length,
      source.relationships.length,
      source.views.length,
      Object.keys(source.viewLayouts).length,
      validation.ok ? validation.warnings : [],
    );

    return { ok: true, bytes, metadata };
  } catch (err) {
    console.error('[Redly Export] Failed:', err);
    return {
      ok: false,
      error:
        'Failed to create .Redly file. ' +
        (err instanceof Error ? err.message : 'Unknown error.'),
    };
  }
};
