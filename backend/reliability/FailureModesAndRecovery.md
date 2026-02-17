# Prompt 9.12 — Failure Modes & Recovery Strategy

This document defines *enterprise-grade* failure handling behavior for graph-backed analysis and traversal.

Principles
- **Graceful errors**: callers receive clear, user-safe error messages.
- **No data loss**: read paths never mutate or auto-correct data.
- **No silent failures**: any abort/error is surfaced via explicit flags/warnings and structured logs.
- **No masking / no auto-repair**: corruption is reported; operators decide remediation.

## Error taxonomy (public)
All API failures return `{ success: false, error: { errorId, code, message, retryable } }`.

Codes
- `GRAPH_BACKEND_UNAVAILABLE` (HTTP 503, retryable): Neo4j/graph store unreachable, session expired, driver unavailable.
- `DATA_INTEGRITY_ERROR` (HTTP 409, non-retryable): detected inconsistency (dangling references, malformed edges, missing root).
- `ANALYSIS_TIMEOUT` (HTTP 504, retryable): analysis exceeded configured deadline and aborted.
- `VALIDATION_ERROR` (HTTP 400): invalid request parameters.
- `NOT_FOUND` (HTTP 404): requested resource missing.
- `CONCURRENCY_LIMIT` (HTTP 429): bounded async job runner saturated.
- `UNKNOWN_ERROR` (HTTP 500): unexpected failure.

Every failure is logged as a one-line JSON record (`type: ea.error`) containing `errorId` for correlation.

## Scenario behavior

### 1) Graph backend unavailable
Detection
- Neo4j read operations throw driver/network errors.

Behavior
- Return `GRAPH_BACKEND_UNAVAILABLE`.
- Never emit partial results.
- Log structured error line and `api.error` telemetry event.

Recovery
- Operator action: restore Neo4j connectivity (service health, DNS, credentials, routing).
- Client action: retry with backoff.

### 2) Partial data corruption
Examples
- Edge references a missing node.
- Relationship is missing required identifiers.

Behavior
- Impact analysis detects and counts integrity issues.
- Default behavior is **degrade-with-warnings**:
  - corrupted edges are skipped
  - traversal does not continue through missing nodes
  - response contains explicit warnings and `integrityIssueCount`
- If the **root** element is missing, treat as `DATA_INTEGRITY_ERROR` (no results).

Recovery
- Operator action: run integrity audit endpoint and fix source-of-truth (import pipeline, outbox replay, or manual correction). No auto-repair.

### 3) Analysis timeout
Behavior
- The engine aborts deterministically when `timeoutMs` elapses.
- Response marks `aborted=true` with `abortedReason=Timeout`.
- API returns `ANALYSIS_TIMEOUT` for explicit “request-level timeout” handling.

Recovery
- Operator action: tune safeguards, investigate pathological graphs, scale backend.
- Client action: retry with smaller scope (depth, includePaths=false, narrower relationship types) or use async jobs.

## Operational hooks
- Telemetry event: `api.error` with tags `{ operation, code, errorId }`.
- Structured logs: `type: ea.error` JSON line for correlation.
