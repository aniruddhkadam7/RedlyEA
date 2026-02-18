export type RevisionedTtlCacheOptions = {
  ttlMs: number;
  maxEntries: number;
};

type CacheEntry<T> = {
  value: T;
  revisionKey: string;
  expiresAtMs: number;
};

const nowMs = () => Date.now();

/**
 * Process-local, revision-aware TTL cache.
 *
 * Design goals:
 * - Explicit TTL per cache instance.
 * - Deterministic invalidation on repository change (revisionKey mismatch).
 * - No persistence; safe for mock/server process only.
 */
export class RevisionedTtlCache<T> {
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly entries = new Map<string, CacheEntry<T>>();

  constructor(options: RevisionedTtlCacheOptions) {
    const ttlMs = Math.trunc(options.ttlMs);
    const maxEntries = Math.trunc(options.maxEntries);

    if (!Number.isFinite(ttlMs) || ttlMs <= 0)
      throw new Error('RevisionedTtlCache: ttlMs must be > 0.');
    if (!Number.isFinite(maxEntries) || maxEntries <= 0)
      throw new Error('RevisionedTtlCache: maxEntries must be > 0.');

    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
  }

  clear(): void {
    this.entries.clear();
  }

  get(key: string, revisionKey: string, atMs = nowMs()): T | null {
    const entry = this.entries.get(key);
    if (!entry) return null;

    if (entry.revisionKey !== revisionKey) {
      this.entries.delete(key);
      return null;
    }

    if (entry.expiresAtMs <= atMs) {
      this.entries.delete(key);
      return null;
    }

    // Best-effort LRU: refresh insertion order.
    this.entries.delete(key);
    this.entries.set(key, entry);

    return entry.value;
  }

  set(key: string, revisionKey: string, value: T, atMs = nowMs()): void {
    // Evict if over capacity.
    while (this.entries.size >= this.maxEntries) {
      const firstKey = this.entries.keys().next().value as string | undefined;
      if (!firstKey) break;
      this.entries.delete(firstKey);
    }

    this.entries.set(key, {
      value,
      revisionKey,
      expiresAtMs: atMs + this.ttlMs,
    });
  }

  async getOrCompute(
    key: string,
    revisionKey: string,
    compute: () => Promise<T>,
  ): Promise<T> {
    const cached = this.get(key, revisionKey);
    if (cached !== null) return cached;

    const value = await compute();
    this.set(key, revisionKey, value);
    return value;
  }
}
