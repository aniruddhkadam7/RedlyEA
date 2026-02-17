/**
 * RedlyViewStore — persistent storage for .Redly view files.
 *
 * Stores the full serialized .Redly file alongside the ViewStore's ViewInstance.
 * This ensures that when a view is reopened, the COMPLETE canvas state is
 * available — nodes, edges, positions, viewport, and all metadata.
 *
 * Storage strategy:
 * - Uses the repository snapshot's `studioState` for persistence.
 * - Falls back gracefully: if no .Redly data exists, the view opens using
 *   the legacy ViewInstance + ViewLayoutStore path.
 *
 * This store is the SINGLE SOURCE OF TRUTH for complete view state.
 */

import {
  readRepositorySnapshot,
  updateRepositorySnapshot,
} from '@/repository/repositorySnapshotStore';
import type { RedlyFile } from './RedlyFileFormat';

const STORAGE_KEY_PREFIX = 'ea.redly.view:';

// ---------------------------------------------------------------------------
// §1: In-memory cache (for fast access during a session)
// ---------------------------------------------------------------------------

const memoryCache = new Map<string, RedlyFile>();

// ---------------------------------------------------------------------------
// §2: Snapshot-based persistence
// ---------------------------------------------------------------------------

const readFromSnapshot = (viewId: string): RedlyFile | null => {
  if (!viewId) return null;

  // Check memory cache first
  const cached = memoryCache.get(viewId);
  if (cached) return cached;

  // Read from repository snapshot
  const snapshot = readRepositorySnapshot();
  const redlyFiles = (snapshot?.studioState as any)?.redlyFiles as
    | Record<string, RedlyFile>
    | undefined;
  if (redlyFiles && redlyFiles[viewId]) {
    const file = redlyFiles[viewId];
    memoryCache.set(viewId, file);
    return file;
  }

  // Try localStorage fallback (for backward compat during migration)
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(`${STORAGE_KEY_PREFIX}${viewId}`);
      if (raw) {
        const parsed = JSON.parse(raw) as RedlyFile;
        memoryCache.set(viewId, parsed);
        // Migrate to snapshot
        writeToSnapshot(viewId, parsed);
        window.localStorage.removeItem(`${STORAGE_KEY_PREFIX}${viewId}`);
        return parsed;
      }
    } catch {
      // ignore
    }
  }

  return null;
};

const writeToSnapshot = (viewId: string, file: RedlyFile): void => {
  if (!viewId) return;
  memoryCache.set(viewId, file);

  updateRepositorySnapshot((current) => {
    if (!current) return current;
    const studioState = (current.studioState ?? {}) as any;
    const redlyFiles = { ...(studioState.redlyFiles ?? {}), [viewId]: file };
    return {
      ...current,
      studioState: { ...studioState, redlyFiles },
      updatedAt: new Date().toISOString(),
    };
  });
};

const removeFromSnapshot = (viewId: string): void => {
  if (!viewId) return;
  memoryCache.delete(viewId);

  updateRepositorySnapshot((current) => {
    if (!current) return current;
    const studioState = (current.studioState ?? {}) as any;
    const redlyFiles = { ...(studioState.redlyFiles ?? {}) };
    delete redlyFiles[viewId];
    return {
      ...current,
      studioState: { ...studioState, redlyFiles },
      updatedAt: new Date().toISOString(),
    };
  });

  // Also clean up any legacy localStorage entry
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.removeItem(`${STORAGE_KEY_PREFIX}${viewId}`);
    } catch {
      // ignore
    }
  }
};

const listAllFromSnapshot = (): Record<string, RedlyFile> => {
  const snapshot = readRepositorySnapshot();
  const redlyFiles = (snapshot?.studioState as any)?.redlyFiles as
    | Record<string, RedlyFile>
    | undefined;
  return redlyFiles ? { ...redlyFiles } : {};
};

// ---------------------------------------------------------------------------
// §3: Public API
// ---------------------------------------------------------------------------

export const RedlyViewStore = {
  /**
   * Save a .Redly file for a view.
   * This is the primary persistence method — called on every save/autosave.
   */
  save(viewId: string, file: RedlyFile): void {
    writeToSnapshot(viewId, file);
  },

  /**
   * Get the .Redly file for a view.
   * Returns null if no .Redly data exists (legacy view).
   */
  get(viewId: string): RedlyFile | null {
    return readFromSnapshot(viewId);
  },

  /**
   * Check if a .Redly file exists for a view.
   */
  has(viewId: string): boolean {
    return readFromSnapshot(viewId) != null;
  },

  /**
   * Remove the .Redly file for a view.
   */
  remove(viewId: string): void {
    removeFromSnapshot(viewId);
  },

  /**
   * List all stored .Redly files.
   */
  listAll(): Record<string, RedlyFile> {
    return listAllFromSnapshot();
  },

  /**
   * Clear the in-memory cache (useful for testing).
   */
  clearCache(): void {
    memoryCache.clear();
  },
} as const;
