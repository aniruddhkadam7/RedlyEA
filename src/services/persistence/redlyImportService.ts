/**
 * Redly Import Service
 *
 * Parses and validates a `.Redly` ZIP file, returning an in-memory `RedlyPackage`.
 *
 * Flow:
 * 1. Validate ZIP magic header.
 * 2. Extract archive safely.
 * 3. Validate required files exist (metadata.json, repository.json).
 * 4. Check format version compatibility (run migration if needed).
 * 5. Validate referential integrity.
 * 6. Return parsed data for the caller to apply.
 *
 * Does NOT modify application state — that is the caller's responsibility.
 */

import { strFromU8, unzip, unzipSync } from 'fflate';
import { redlySha256Hex } from './redlyPackageUtils';
import { checkAndMigrateVersion } from './redlyMigration';
import type {
  RedlyDiagramData,
  RedlyImportResult,
  RedlyLayoutData,
  RedlyMetadata,
  RedlyPackage,
  RedlyRepositoryData,
} from './redlyTypes';
import {
  validateRedlyMetadataStructure,
  validateRedlyRepositoryStructure,
  validateRepositoryData,
} from './redlyValidation';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Normalize ZIP entry paths (forward slashes, strip leading slashes). */
const normalizePath = (p: string): string =>
  p.replace(/\\/g, '/').replace(/^\/+/, '');

/** Build a lookup map from raw unzipped entries. */
const buildFileMap = (
  raw: Record<string, Uint8Array>,
): Record<string, Uint8Array> => {
  const map: Record<string, Uint8Array> = {};
  for (const [key, value] of Object.entries(raw)) {
    const normalized = normalizePath(key);
    if (normalized.endsWith('/') || !value || value.length === 0) continue;
    map[normalized] = value;
  }
  return map;
};

/** Parse a JSON file from the ZIP map. Throws on missing or invalid JSON. */
const readJson = <T>(
  files: Record<string, Uint8Array>,
  filePath: string,
): T => {
  const bytes = files[normalizePath(filePath)];
  if (!bytes) {
    const available = Object.keys(files).join(', ');
    throw new Error(
      `Missing required file: ${filePath}. Available files: [${available}]`,
    );
  }
  try {
    return JSON.parse(strFromU8(bytes)) as T;
  } catch (err) {
    throw new Error(
      `Failed to parse JSON in "${filePath}": ${err instanceof Error ? err.message : 'Unknown parse error'}`,
    );
  }
};

/** Parse an optional JSON file — returns fallback if not found. */
const readJsonOptional = <T>(
  files: Record<string, Uint8Array>,
  filePath: string,
  fallback: T,
): T => {
  const bytes = files[normalizePath(filePath)];
  if (!bytes) return fallback;
  try {
    return JSON.parse(strFromU8(bytes)) as T;
  } catch {
    return fallback;
  }
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse and validate a `.Redly` file from raw bytes.
 *
 * @param bytes The raw file bytes (Uint8Array from file read or Electron IPC).
 * @returns `{ ok: true, data, warnings }` on success, `{ ok: false, error }` on failure.
 */
export const parseRedlyFile = async (
  bytes: Uint8Array,
): Promise<RedlyImportResult> => {
  // -----------------------------------------------------------------------
  // Step 0: Sanity checks
  // -----------------------------------------------------------------------
  if (!bytes || bytes.length === 0) {
    return {
      ok: false,
      error: 'Empty file. Please select a valid .Redly repository file.',
    };
  }

  // Ensure we have a real Uint8Array (Electron IPC may deliver a plain object)
  let safeBytes: Uint8Array;
  if (bytes instanceof Uint8Array) {
    safeBytes = bytes;
  } else if (ArrayBuffer.isView(bytes)) {
    safeBytes = new Uint8Array((bytes as ArrayBufferView).buffer);
  } else if (typeof (bytes as any).length === 'number') {
    safeBytes = new Uint8Array(
      Array.from(
        { length: (bytes as any).length },
        (_, i) => (bytes as any)[i],
      ),
    );
  } else {
    return { ok: false, error: 'Invalid file format. Could not read file bytes.' };
  }

  // Validate ZIP magic header (PK\x03\x04)
  if (
    safeBytes.length < 4 ||
    safeBytes[0] !== 0x50 ||
    safeBytes[1] !== 0x4b ||
    safeBytes[2] !== 0x03 ||
    safeBytes[3] !== 0x04
  ) {
    return {
      ok: false,
      error:
        'This file is not a valid .Redly archive. Expected a ZIP file with PK header. ' +
        'The file may be corrupted or is not a .Redly repository file.',
    };
  }

  try {
    // -----------------------------------------------------------------------
    // Step 1: Unzip
    // -----------------------------------------------------------------------
    let rawFiles: Record<string, Uint8Array>;
    try {
      rawFiles = await new Promise<Record<string, Uint8Array>>(
        (resolve, reject) => {
          unzip(safeBytes, (err, data) => {
            if (err) {
              reject(err);
              return;
            }
            resolve(data as Record<string, Uint8Array>);
          });
        },
      );
    } catch {
      // Sync fallback for edge cases
      try {
        rawFiles = unzipSync(safeBytes) as Record<string, Uint8Array>;
      } catch (syncErr) {
        return {
          ok: false,
          error:
            'Failed to extract .Redly archive. The file may be corrupted. ' +
            (syncErr instanceof Error ? syncErr.message : ''),
        };
      }
    }

    const files = buildFileMap(rawFiles);
    console.log('[Redly Import] Extracted files:', Object.keys(files).join(', '));

    // -----------------------------------------------------------------------
    // Step 2: Validate required files
    // -----------------------------------------------------------------------
    if (!files['metadata.json']) {
      return {
        ok: false,
        error: `Invalid .Redly file: missing metadata.json. Found: [${Object.keys(files).join(', ')}]`,
      };
    }
    if (!files['repository.json']) {
      return {
        ok: false,
        error: `Invalid .Redly file: missing repository.json. Found: [${Object.keys(files).join(', ')}]`,
      };
    }

    // -----------------------------------------------------------------------
    // Step 3: Parse metadata
    // -----------------------------------------------------------------------
    const metadata = readJson<RedlyMetadata>(files, 'metadata.json');
    const metadataError = validateRedlyMetadataStructure(metadata);
    if (metadataError) {
      return { ok: false, error: metadataError };
    }

    // -----------------------------------------------------------------------
    // Step 4: Parse repository
    // -----------------------------------------------------------------------
    const repository = readJson<RedlyRepositoryData>(files, 'repository.json');
    const repoError = validateRedlyRepositoryStructure(repository);
    if (repoError) {
      return { ok: false, error: repoError };
    }

    // Ensure optional arrays exist
    repository.designWorkspaces = repository.designWorkspaces ?? [];
    repository.baselines = repository.baselines ?? [];
    repository.importHistory = repository.importHistory ?? [];
    repository.versionHistory = repository.versionHistory ?? [];

    // -----------------------------------------------------------------------
    // Step 5: Parse diagrams (from diagrams/*.json)
    // -----------------------------------------------------------------------
    const diagrams: RedlyDiagramData[] = [];
    for (const [path, entry] of Object.entries(files)) {
      if (path.startsWith('diagrams/') && path.endsWith('.json')) {
        try {
          const diagram = JSON.parse(strFromU8(entry)) as RedlyDiagramData;
          diagrams.push(diagram);
        } catch (err) {
          return {
            ok: false,
            error: `Failed to parse diagram file "${path}": ${err instanceof Error ? err.message : 'Invalid JSON'}`,
          };
        }
      }
    }

    // -----------------------------------------------------------------------
    // Step 6: Parse layouts (from layouts/*.layout.json)
    // -----------------------------------------------------------------------
    const layouts: Record<string, RedlyLayoutData> = {};
    for (const [path, entry] of Object.entries(files)) {
      if (path.startsWith('layouts/') && path.endsWith('.layout.json')) {
        const viewId = path
          .replace('layouts/', '')
          .replace('.layout.json', '');
        try {
          layouts[viewId] = JSON.parse(strFromU8(entry)) as RedlyLayoutData;
        } catch (err) {
          return {
            ok: false,
            error: `Failed to parse layout file "${path}": ${err instanceof Error ? err.message : 'Invalid JSON'}`,
          };
        }
      }
    }

    // -----------------------------------------------------------------------
    // Step 7: Checksum validation
    // -----------------------------------------------------------------------
    const warnings: string[] = [];
    if (metadata.checksum) {
      const repositoryBytes = files['repository.json'];
      if (repositoryBytes) {
        const computed = await redlySha256Hex(repositoryBytes);
        if (computed && computed !== metadata.checksum) {
          warnings.push(
            'Checksum mismatch: repository.json may have been modified outside of the application.',
          );
        }
      }
    }

    // -----------------------------------------------------------------------
    // Step 8: Assemble package & check version compatibility
    // -----------------------------------------------------------------------
    let pkg: RedlyPackage = {
      metadata,
      repository,
      diagrams,
      layouts,
    };

    const migrationResult = checkAndMigrateVersion(pkg);
    if (migrationResult.result.status === 'incompatible') {
      return { ok: false, error: migrationResult.result.error };
    }
    if (migrationResult.result.status === 'migrated') {
      warnings.push(
        `File migrated from format version ${migrationResult.result.fromVersion} to ${migrationResult.result.toVersion}.`,
      );
    }
    pkg = migrationResult.pkg;

    // -----------------------------------------------------------------------
    // Step 9: Referential integrity validation
    // -----------------------------------------------------------------------
    const validation = validateRepositoryData({
      objects: pkg.repository.objects,
      relationships: pkg.repository.relationships,
      diagrams: pkg.diagrams,
      layouts: pkg.layouts,
    });

    if (!validation.ok) {
      return {
        ok: false,
        error:
          'Repository integrity check failed:\n\n' +
          validation.errors.join('\n'),
      };
    }
    if (validation.warnings.length > 0) {
      warnings.push(...validation.warnings);
    }

    // -----------------------------------------------------------------------
    // Step 10: Success
    // -----------------------------------------------------------------------
    console.log(
      `[Redly Import] Successfully parsed: ${pkg.repository.objects.length} elements, ` +
        `${pkg.repository.relationships.length} relationships, ` +
        `${pkg.diagrams.length} diagrams, ${Object.keys(pkg.layouts).length} layouts`,
    );

    return { ok: true, data: pkg, warnings };
  } catch (err) {
    console.error('[Redly Import] Parse failed:', err);
    return {
      ok: false,
      error:
        'Failed to parse .Redly file. ' +
        (err instanceof Error ? err.message : 'Unknown error.'),
    };
  }
};
