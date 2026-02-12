// Cache policy: explicit TTLs and bounded sizes.
//
// Notes:
// - These caches are process-local (no shared cache), and must be invalidated on repository changes.
// - Keep TTLs short to avoid surprising staleness in interactive sessions.

export const CACHE_POLICY = {
  // Read-only repository query caching (GraphAbstractionLayerStore)
  graphQuery: {
    ttlMs: 5_000,
    maxEntries: 20_000,
  },

  // View resolution caching (ViewResolver)
  viewResolution: {
    ttlMs: 2_000,
    maxEntries: 50,
  },
} as const;
