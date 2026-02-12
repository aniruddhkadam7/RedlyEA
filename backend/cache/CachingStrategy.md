# Caching Strategy (Prompt 9.9)

## Goals
- Predictable performance gains for read-heavy UI operations.
- Deterministic correctness: caching must never change outputs.
- Explicit operational behavior: TTLs are explicit, invalidation is explicit.

## Cacheable
### 1) Read-only repository queries
Where: `backend/graph/GraphAbstractionLayerStore.ts`
- Cached calls:
  - `getNode(id)`
  - `getOutgoingEdges(id)`
  - `getIncomingEdges(id)`
  - `getNodesByType(type)`

Rules:
- Cache is **process-local** (in-memory). No persistence.
- Entries are **revision invalidated** on repository or relationship change.
- TTL is explicit (see `backend/cache/CachePolicy.ts`).

### 2) View resolutions (short-lived)
Where: `backend/views/ViewResolver.ts`
- Cached unit: `resolve(view)`.

Rules:
- TTL is intentionally short (interactive UI smoothing).
- Invalidation is revision-based on:
  - repository changes
  - relationship changes
  - view repository changes

## Not cacheable
### Impact analysis results
- Do not cache across requests.
- Exception: if a user explicitly requests asynchronous execution, results may be stored for later retrieval by **job id** (this is not reused for other requests).

### Governance findings
- Never cached (must reflect current repository state exactly and remain audit-safe).

## Invalidation model
- `RepositoryStore`, `RelationshipRepositoryStore`, and `ViewRepositoryStore` each expose a **monotonic revision**.
- Any mutation (add/replace) bumps the relevant revision.
- Caches record the revisionKey used at write time; mismatches are treated as cache misses.

## TTL policy
- TTLs and max sizes are centralized in `backend/cache/CachePolicy.ts`.
- No ad-hoc caching without an explicit TTL.

## Explicit non-goals
- No UI-state caching (React state is not treated as a cache).
- No unbounded queues or unbounded caches.
- No cross-process distributed cache (future prompt).
