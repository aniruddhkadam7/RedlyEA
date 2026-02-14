/**
 * Redly Migration Service
 *
 * Handles forward migration of `.Redly` files created by older versions.
 * Each migration function transforms data from version N to N+1.
 *
 * Rules:
 * - If `formatVersion` < current → run migration chain
 * - If `formatVersion` > current → block load (incompatible future version)
 * - If `formatVersion` === current → no migration needed
 */

import { REDLY_FORMAT_VERSION, type RedlyPackage } from './redlyTypes';

// ---------------------------------------------------------------------------
// Semantic version comparison
// ---------------------------------------------------------------------------

type SemVer = { major: number; minor: number; patch: number };

const parseSemVer = (version: string): SemVer | null => {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
  };
};

const compareSemVer = (a: SemVer, b: SemVer): number => {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
};

// ---------------------------------------------------------------------------
// Migration registry
// ---------------------------------------------------------------------------

/**
 * Each migration transforms a RedlyPackage from one version to the next.
 * The `from` field is the version the migration applies to.
 * The `to` field is the version after migration.
 */
type Migration = {
  from: string;
  to: string;
  migrate: (pkg: RedlyPackage) => RedlyPackage;
};

/**
 * Registry of all migrations, ordered from oldest to newest.
 * Add new migrations here as the format evolves.
 *
 * Example for future use:
 *   { from: '1.0.0', to: '1.1.0', migrate: (pkg) => { ... return pkg; } }
 */
const migrations: Migration[] = [
  // No migrations yet — version 1.0.0 is the initial release.
  // Future migrations will be added here in order.
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type MigrationCheckResult =
  | { status: 'current' }
  | { status: 'migrated'; fromVersion: string; toVersion: string }
  | { status: 'incompatible'; error: string };

/**
 * Check whether a `.Redly` file's format version is compatible with this
 * version of the application, and apply any necessary migrations.
 *
 * - If the file is from the current version → returns `current`.
 * - If the file is from an older version → runs migration chain, returns `migrated`.
 * - If the file is from a newer version → returns `incompatible`.
 */
export const checkAndMigrateVersion = (
  pkg: RedlyPackage,
): { result: MigrationCheckResult; pkg: RedlyPackage } => {
  const currentVer = parseSemVer(REDLY_FORMAT_VERSION);
  const fileVer = parseSemVer(pkg.metadata.formatVersion);

  if (!currentVer) {
    return {
      result: {
        status: 'incompatible',
        error: `Invalid current format version: ${REDLY_FORMAT_VERSION}`,
      },
      pkg,
    };
  }

  if (!fileVer) {
    return {
      result: {
        status: 'incompatible',
        error: `Invalid file format version: ${pkg.metadata.formatVersion}`,
      },
      pkg,
    };
  }

  const cmp = compareSemVer(fileVer, currentVer);

  // File is from a NEWER version — cannot load.
  if (cmp > 0) {
    return {
      result: {
        status: 'incompatible',
        error:
          `This file was created with Redly format version ${pkg.metadata.formatVersion}, ` +
          `but this application only supports up to version ${REDLY_FORMAT_VERSION}. ` +
          `Please update the application to open this file.`,
      },
      pkg,
    };
  }

  // File is current — no migration needed.
  if (cmp === 0) {
    return { result: { status: 'current' }, pkg };
  }

  // File is from an OLDER version — apply migrations.
  const originalVersion = pkg.metadata.formatVersion;
  let migrated = pkg;

  for (const migration of migrations) {
    if (migrated.metadata.formatVersion === migration.from) {
      migrated = migration.migrate(migrated);
      migrated = {
        ...migrated,
        metadata: {
          ...migrated.metadata,
          formatVersion: migration.to,
        },
      };
    }
  }

  // After running all migrations, check if we reached the current version.
  const finalVer = parseSemVer(migrated.metadata.formatVersion);
  if (!finalVer || compareSemVer(finalVer, currentVer) !== 0) {
    return {
      result: {
        status: 'incompatible',
        error:
          `Unable to migrate file from version ${originalVersion} to ${REDLY_FORMAT_VERSION}. ` +
          `Reached version ${migrated.metadata.formatVersion} but no further migration path exists.`,
      },
      pkg: migrated,
    };
  }

  return {
    result: {
      status: 'migrated',
      fromVersion: originalVersion,
      toVersion: REDLY_FORMAT_VERSION,
    },
    pkg: migrated,
  };
};
