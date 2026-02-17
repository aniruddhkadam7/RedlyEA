import type {
  CanonicalEnvelope,
  CanonicalUnsupportedField,
  CanonicalUnsupportedFieldReason,
} from './CanonicalExchangeModel';

export type ImportResolutionStrategy = 'reject' | 'map' | 'ignore';

export type ImportTargetKind =
  | 'Capability'
  | 'BusinessProcess'
  | 'Application'
  | 'Technology'
  | 'Programme'
  | 'Relationship'
  | 'View'
  | 'GovernanceRule'
  | 'ADR';

export type ImportFieldPath = string;

export type ImportMappingRule = {
  /** Incoming field path (stable, JSONPath-like). Example: "$.Application Code" or "$.owner.name". */
  from: ImportFieldPath;

  /** Target internal field name/path (dot-separated). Example: "applicationCode" or "ownerName". */
  to: string;

  /** Explicit strategy for this mapping rule. */
  strategy: Extract<ImportResolutionStrategy, 'map' | 'ignore' | 'reject'>;

  /** Optional transformer; only used when strategy === 'map'. */
  transform?: (value: unknown) => unknown;
};

export type ImportMappingIssueCode =
  | 'UNMAPPED_FIELD'
  | 'UNSUPPORTED_CONCEPT'
  | 'MISSING_REQUIRED_FIELD'
  | 'ID_CONFLICT'
  | 'INVALID_MAPPING_RULE';

export type ImportMappingIssueSeverity = 'Warning' | 'Error';

export type ImportMappingIssue = {
  severity: ImportMappingIssueSeverity;
  code: ImportMappingIssueCode;
  message: string;

  /** Optional source pointer (e.g., "line:12" or "$.fields.owner"). */
  sourceRef?: string;

  /** Optional incoming field path. */
  from?: ImportFieldPath;

  /** Optional target field path. */
  to?: string;
};

export type ImportIdConflictResolution =
  | { strategy: 'reject' }
  | { strategy: 'ignore' }
  | {
      strategy: 'map';
      /** Explicit mapping table: incomingId -> replacementId */
      idMap: Readonly<Record<string, string>>;
    };

export type ImportMappingPolicy = {
  /** Default behavior for unmapped fields. Must be explicit to avoid silent drops. */
  onUnmappedField: Extract<ImportResolutionStrategy, 'reject' | 'ignore'>;

  /** Default behavior for missing required target fields. */
  onMissingRequiredField: Extract<ImportResolutionStrategy, 'reject' | 'ignore'>;

  /** Conflict behavior when incoming ids collide with existing ids or within the batch. */
  onIdConflict: ImportIdConflictResolution;
};

export type ImportMappingPlan = {
  targetKind: ImportTargetKind;

  /** Required internal fields for this target kind (e.g., "id", "name"). */
  requiredTargetFields: readonly string[];

  /** Mapping rules for known incoming fields. */
  rules: readonly ImportMappingRule[];

  /** Resolver policy for anything not covered by rules. */
  policy: ImportMappingPolicy;
};

export type ImportMappingResolverInput = {
  /**
   * Incoming records (raw objects). The resolver will treat top-level keys as "$.<key>" paths.
   * Determinism: input order matters and is preserved.
   */
  records: ReadonlyArray<Record<string, unknown>>;

  /** Optional for better messages, e.g. "Capabilities.csv". */
  sourceDescription?: string;

  /** Optional source line numbers (1-based file line). Must align with records index. */
  recordLineNumbers?: ReadonlyArray<number>;

  /** Existing IDs to detect conflicts (optional but recommended). */
  existingIds?: {
    elementIds?: ReadonlySet<string>;
    relationshipIds?: ReadonlySet<string>;
  };
};

export type ImportMappingResolverSuccess<T> = {
  ok: true;

  /** Mapped records in input order (some may be omitted if policy ignores them). */
  mapped: CanonicalEnvelope<T>[];

  /** All warnings/errors (deterministically ordered). */
  issues: ImportMappingIssue[];
};

export type ImportMappingResolverFailure = {
  ok: false;
  issues: ImportMappingIssue[];
};

export type ImportMappingResolverResult<T> =
  | ImportMappingResolverSuccess<T>
  | ImportMappingResolverFailure;

const toJsonPathKey = (key: string) => `$.${String(key)}`;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

const sortIssues = (a: ImportMappingIssue, b: ImportMappingIssue) =>
  (a.sourceRef ?? '').localeCompare(b.sourceRef ?? '') ||
  a.severity.localeCompare(b.severity) ||
  a.code.localeCompare(b.code) ||
  (a.from ?? '').localeCompare(b.from ?? '') ||
  (a.to ?? '').localeCompare(b.to ?? '') ||
  a.message.localeCompare(b.message);

const sortUnsupportedFields = (a: CanonicalUnsupportedField, b: CanonicalUnsupportedField) =>
  a.path.localeCompare(b.path) || a.reason.localeCompare(b.reason) || (a.message ?? '').localeCompare(b.message ?? '');

const getDeep = (obj: Record<string, unknown>, path: string): unknown => {
  const parts = (path ?? '').split('.').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return undefined;

  let current: unknown = obj;
  for (const p of parts) {
    if (!isPlainObject(current)) return undefined;
    current = current[p];
  }

  return current;
};

const setDeep = (obj: Record<string, unknown>, path: string, value: unknown) => {
  const parts = (path ?? '').split('.').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return;

  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    const existing = current[key];
    if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
      current = existing as Record<string, unknown>;
      continue;
    }

    const next: Record<string, unknown> = {};
    current[key] = next;
    current = next;
  }

  current[parts[parts.length - 1]] = value;
};

type FlattenedEntry = { path: string; value: unknown };

/**
 * Deterministically flattens a record into JSONPath-like leaf paths.
 *
 * Examples:
 * - { a: 1 } => $.a
 * - { owner: { name: 'x' } } => $.owner.name
 * - { tags: ['a','b'] } => $.tags[0], $.tags[1]
 */
const flattenToJsonPathLeaves = (record: Record<string, unknown>): FlattenedEntry[] => {
  const out: FlattenedEntry[] = [];

  const visit = (value: unknown, path: string) => {
    if (Array.isArray(value)) {
      if (value.length === 0) {
        // Preserve explicit empty arrays as a value at the parent path.
        out.push({ path, value });
        return;
      }

      for (let i = 0; i < value.length; i += 1) {
        visit(value[i], `${path}[${i}]`);
      }
      return;
    }

    if (isPlainObject(value)) {
      const keys = Object.keys(value).sort((a, b) => a.localeCompare(b));
      if (keys.length === 0) {
        // Preserve explicit empty objects as a value at the parent path.
        out.push({ path, value });
        return;
      }

      for (const k of keys) {
        const nextPath = path ? `${path}.${k}` : toJsonPathKey(k);
        // If path already includes '$.' prefix, keep building beneath it.
        const effectivePath = path.startsWith('$.') ? `${path}.${k}` : nextPath;
        visit((value as Record<string, unknown>)[k], effectivePath);
      }
      return;
    }

    out.push({ path, value });
  };

  const topKeys = Object.keys(record ?? {}).sort((a, b) => a.localeCompare(b));
  for (const k of topKeys) {
    visit(record[k], toJsonPathKey(k));
  }

  // Deterministic stable order by path.
  return out.sort((a, b) => a.path.localeCompare(b.path));
};

const getIdConflictSet = (targetKind: ImportTargetKind, existingIds?: ImportMappingResolverInput['existingIds']) => {
  if (targetKind === 'Relationship') return existingIds?.relationshipIds ?? new Set<string>();
  return existingIds?.elementIds ?? new Set<string>();
};

const normalizeReason = (reason: CanonicalUnsupportedFieldReason): CanonicalUnsupportedFieldReason => {
  switch (reason) {
    case 'UNMAPPED':
    case 'UNSUPPORTED':
    case 'INVALID':
    case 'AMBIGUOUS':
    case 'CONFLICT':
      return reason;
    default:
      return 'UNMAPPED';
  }
};

/**
 * ImportMappingResolver
 *
 * Responsibilities:
 * - Map incoming fields to internal domain fields.
 * - Detect missing fields, unsupported concepts, conflicting IDs.
 * - Require explicit strategy for each unmapped/missing/conflicting situation.
 * - Never silently drop data: ignored/unmapped fields become unsupportedFields annotations.
 *
 * Notes:
 * - This is a pure transformation/validation step; it does not persist or execute imports.
 */
export function resolveImportMapping<T extends { id?: unknown }>(
  plan: ImportMappingPlan,
  input: ImportMappingResolverInput,
): ImportMappingResolverResult<T> {
  const issues: ImportMappingIssue[] = [];

  // Index rules by from-path.
  const ruleByFrom = new Map<ImportFieldPath, ImportMappingRule>();
  for (const r of plan.rules) {
    if (!r.from || !r.to) {
      issues.push({
        severity: 'Error',
        code: 'INVALID_MAPPING_RULE',
        message: 'Mapping rule must include both from and to.',
      });
      continue;
    }

    if (ruleByFrom.has(r.from)) {
      issues.push({
        severity: 'Error',
        code: 'INVALID_MAPPING_RULE',
        message: `Duplicate mapping rule for "${r.from}".`,
        from: r.from,
      });
      continue;
    }

    ruleByFrom.set(r.from, r);
  }

  if (issues.some((i) => i.severity === 'Error')) {
    return { ok: false, issues: issues.sort(sortIssues) };
  }

  const existing = getIdConflictSet(plan.targetKind, input.existingIds);
  const seenIncomingIds = new Set<string>();

  const mapped: CanonicalEnvelope<T>[] = [];

  const records = input.records ?? [];

  for (let idx = 0; idx < records.length; idx += 1) {
    const record = records[idx] ?? {};
    const line = input.recordLineNumbers?.[idx];
    const sourceRef = line ? `line:${line}` : `record:${idx + 1}`;

    const out: Record<string, unknown> = {};
    const unsupportedFields: CanonicalUnsupportedField[] = [];

    const leaves = flattenToJsonPathLeaves(record);

    for (const { path: fromPath, value } of leaves) {

      const rule = ruleByFrom.get(fromPath);
      if (rule) {
        if (rule.strategy === 'ignore') {
          unsupportedFields.push({
            path: fromPath,
            value,
            reason: normalizeReason('UNMAPPED'),
            message: `Ignored by explicit rule (to: ${rule.to}).`,
          });
          issues.push({
            severity: 'Warning',
            code: 'UNMAPPED_FIELD',
            message: `Ignored incoming field "${fromPath}" by explicit rule.`,
            sourceRef,
            from: fromPath,
            to: rule.to,
          });
          continue;
        }

        if (rule.strategy === 'reject') {
          issues.push({
            severity: 'Error',
            code: 'UNSUPPORTED_CONCEPT',
            message: `Rejected incoming field "${fromPath}" by explicit rule.`,
            sourceRef,
            from: fromPath,
            to: rule.to,
          });
          continue;
        }

        // map
        const transformed = rule.transform ? rule.transform(value) : value;
        setDeep(out, rule.to, transformed);
        continue;
      }

      // Unmapped field.
      if (plan.policy.onUnmappedField === 'reject') {
        issues.push({
          severity: 'Error',
          code: 'UNMAPPED_FIELD',
          message: `Unmapped incoming field "${fromPath}" (no mapping rule provided).`,
          sourceRef,
          from: fromPath,
        });
        continue;
      }

      // ignore (logged)
      unsupportedFields.push({
        path: fromPath,
        value,
        reason: normalizeReason('UNMAPPED'),
        message: 'Ignored by policy (no mapping rule).',
      });

      issues.push({
        severity: 'Warning',
        code: 'UNMAPPED_FIELD',
        message: `Ignored unmapped incoming field "${fromPath}".`,
        sourceRef,
        from: fromPath,
      });
    }

    // Missing required target fields.
    for (const required of plan.requiredTargetFields ?? []) {
      const v = required.includes('.') ? getDeep(out, required) : (out as any)[required];
      const missing = v === undefined || v === null || (typeof v === 'string' && v.trim().length === 0);
      if (!missing) continue;

      if (plan.policy.onMissingRequiredField === 'reject') {
        issues.push({
          severity: 'Error',
          code: 'MISSING_REQUIRED_FIELD',
          message: `Missing required target field "${required}" after mapping.`,
          sourceRef,
          to: required,
        });
      } else {
        issues.push({
          severity: 'Warning',
          code: 'MISSING_REQUIRED_FIELD',
          message: `Missing required target field "${required}" after mapping (ignored by policy).`,
          sourceRef,
          to: required,
        });
      }
    }

    // ID conflict detection & resolution.
    const rawId = (out as any).id;
    const id = typeof rawId === 'string' ? rawId.trim() : '';
    if (id) {
      const already = existing.has(id) || seenIncomingIds.has(id);
      if (already) {
        const policy = plan.policy.onIdConflict;

        if (policy.strategy === 'map') {
          const next = (policy.idMap?.[id] ?? '').trim();
          if (!next) {
            issues.push({
              severity: 'Error',
              code: 'ID_CONFLICT',
              message: `ID conflict for "${id}" but no explicit idMap entry was provided.`,
              sourceRef,
              to: 'id',
            });
          } else {
            (out as any).id = next;
            issues.push({
              severity: 'Warning',
              code: 'ID_CONFLICT',
              message: `ID conflict for "${id}" resolved by explicit idMap -> "${next}".`,
              sourceRef,
              to: 'id',
            });
          }
        } else if (policy.strategy === 'ignore') {
          issues.push({
            severity: 'Warning',
            code: 'ID_CONFLICT',
            message: `ID conflict for "${id}"; record ignored by policy.`,
            sourceRef,
            to: 'id',
          });

          unsupportedFields.push({
            path: '$.id',
            value: id,
            reason: normalizeReason('CONFLICT'),
            message: 'Record ignored due to ID conflict.',
          });

          // Skip committing this mapped record.
          continue;
        } else {
          issues.push({
            severity: 'Error',
            code: 'ID_CONFLICT',
            message: `ID conflict for "${id}".`,
            sourceRef,
            to: 'id',
          });
        }
      }

      seenIncomingIds.add((out as any).id);
    }

    unsupportedFields.sort(sortUnsupportedFields);

    mapped.push({
      value: out as unknown as T,
      annotations:
        unsupportedFields.length > 0
          ? {
              unsupportedFields,
            }
          : undefined,
    });
  }

  const sortedIssues = issues.sort(sortIssues);
  const hasErrors = sortedIssues.some((i) => i.severity === 'Error');
  if (hasErrors) return { ok: false, issues: sortedIssues };

  return { ok: true, mapped, issues: sortedIssues };
}
