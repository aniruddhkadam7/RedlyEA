import type {
  ExportAuditScope,
  ImportAuditScope,
  ImportExportActor,
  ImportExportAuditRecord,
  ImportExportErrorDigest,
  ImportExportOperation,
  ImportExportOutcome,
  ImportExportResultSummary,
} from './ImportExportAudit';

const normalizeId = (value: string) => (value ?? '').trim();

const safeNowIso = () => new Date().toISOString();

const safeTruncate = (value: unknown, maxLen: number): string => {
  const s = typeof value === 'string' ? value : String(value ?? '');
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen - 1)}…`;
};

const coerceStringList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) {
    if (typeof v !== 'string') continue;
    const t = v.trim();
    if (t) out.push(t);
  }
  return Array.from(new Set(out)).sort((a, b) => a.localeCompare(b));
};

export type ImportExportAuditRecordInput = {
  requestId?: string;
  operation: ImportExportOperation;

  actor: ImportExportActor;

  startedAt: string;
  completedAt: string;

  scope: ImportAuditScope | ExportAuditScope;
  result: ImportExportResultSummary;
};

export class ImportExportAuditTrail {
  private readonly records: ImportExportAuditRecord[] = [];
  private counter = 0;

  constructor(private readonly maxRecords = 500) {}

  /**
   * Record a single import/export operation.
   *
   * Non-blocking guarantee is enforced by callers: they must wrap this in try/catch.
   */
  record(input: ImportExportAuditRecordInput): ImportExportAuditRecord {
    this.counter += 1;
    const requestId = normalizeId(input.requestId ?? '') || 'no-request-id';
    const auditId = `audit_ie_${this.counter}_${requestId}`;

    const startedAt = normalizeId(input.startedAt) || safeNowIso();
    const completedAt = normalizeId(input.completedAt) || safeNowIso();

    const durationMs = Math.max(
      0,
      Date.parse(completedAt) - Date.parse(startedAt),
    );

    const record: ImportExportAuditRecord = {
      auditId,
      operation: input.operation,
      actor: {
        actorId: normalizeId(input.actor.actorId) || 'unknown',
        displayName: normalizeId(input.actor.displayName ?? '') || undefined,
        access: normalizeId(input.actor.access ?? '') || undefined,
      },
      startedAt,
      completedAt,
      durationMs: Number.isFinite(durationMs) ? durationMs : 0,
      scope: this.normalizeScope(input.scope),
      result: this.normalizeResult(input.result),
      requestId: normalizeId(input.requestId ?? '') || undefined,
    };

    this.records.unshift(record);
    if (this.records.length > this.maxRecords) {
      this.records.length = this.maxRecords;
    }

    return record;
  }

  listRecent(
    limit = 50,
    filter?: {
      operation?: ImportExportOperation;
      outcome?: ImportExportOutcome;
    },
  ): ImportExportAuditRecord[] {
    const safeLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
    const operation = filter?.operation;
    const outcome = filter?.outcome;

    const out: ImportExportAuditRecord[] = [];
    for (const r of this.records) {
      if (operation && r.operation !== operation) continue;
      if (outcome && r.result.outcome !== outcome) continue;
      out.push(r);
      if (out.length >= safeLimit) break;
    }
    return out;
  }

  getByAuditId(auditId: string): ImportExportAuditRecord | null {
    const id = normalizeId(auditId);
    if (!id) return null;
    return this.records.find((r) => r.auditId === id) ?? null;
  }

  private normalizeScope(
    scope: ImportAuditScope | ExportAuditScope,
  ): ImportAuditScope | ExportAuditScope {
    // Keep scope lossless but safe. No datasets allowed.
    if ((scope as any)?.format === 'CSV') {
      const s = scope as ExportAuditScope;
      return {
        exportType: normalizeId(s.exportType) || 'Unknown',
        includedElementTypes: coerceStringList(s.includedElementTypes),
        includedRelationshipTypes: coerceStringList(
          s.includedRelationshipTypes,
        ),
        includeViews: Boolean(s.includeViews),
        includeGovernanceArtifacts: Boolean(s.includeGovernanceArtifacts),
        format: 'CSV',
      };
    }

    const s = scope as ImportAuditScope;
    const st = normalizeId(s.sourceType) as ImportAuditScope['sourceType'];
    const sourceType: ImportAuditScope['sourceType'] =
      st === 'ArchiMate' || st === 'ToolSpecific' ? st : 'CSV';

    return {
      sourceType,
      csvEntity: normalizeId(s.csvEntity ?? '') || undefined,
      sourceDescription: normalizeId(s.sourceDescription ?? '') || undefined,
      payloadBytes:
        typeof s.payloadBytes === 'number' && Number.isFinite(s.payloadBytes)
          ? Math.max(0, s.payloadBytes)
          : undefined,
    };
  }

  private normalizeResult(
    result: ImportExportResultSummary,
  ): ImportExportResultSummary {
    const outcome: ImportExportOutcome =
      result.outcome === 'FAILURE' ? 'FAILURE' : 'SUCCESS';

    const digest = this.normalizeErrorDigest(result.errorDigest);

    return {
      outcome,
      importedElementsCount: this.safeCount(result.importedElementsCount),
      importedRelationshipsCount: this.safeCount(
        result.importedRelationshipsCount,
      ),
      exportedElementsCount: this.safeCount(result.exportedElementsCount),
      exportedRelationshipsCount: this.safeCount(
        result.exportedRelationshipsCount,
      ),
      warningCount: this.safeCount(result.warningCount),
      errorCount: this.safeCount(result.errorCount),
      ...(digest.length > 0 ? { errorDigest: digest } : {}),
    };
  }

  private normalizeErrorDigest(
    digest: ImportExportErrorDigest[] | undefined,
  ): ImportExportErrorDigest[] {
    if (!Array.isArray(digest) || digest.length === 0) return [];

    const out: ImportExportErrorDigest[] = [];
    for (const d of digest.slice(0, 25)) {
      if (!d) continue;
      out.push({
        code: normalizeId((d as any).code ?? '') || undefined,
        message: safeTruncate((d as any).message ?? '', 240),
        line:
          typeof (d as any).line === 'number' &&
          Number.isFinite((d as any).line)
            ? Math.trunc((d as any).line)
            : undefined,
        column: normalizeId((d as any).column ?? '') || undefined,
      });
    }

    // Deterministic order: code, line, column, message
    out.sort((a, b) => {
      const ac = a.code ?? '';
      const bc = b.code ?? '';
      if (ac !== bc) return ac.localeCompare(bc);
      const al = a.line ?? 0;
      const bl = b.line ?? 0;
      if (al !== bl) return al - bl;
      const acol = a.column ?? '';
      const bcol = b.column ?? '';
      if (acol !== bcol) return acol.localeCompare(bcol);
      return (a.message ?? '').localeCompare(b.message ?? '');
    });

    return out;
  }

  private safeCount(value: unknown): number | undefined {
    if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
    return Math.max(0, Math.trunc(value));
  }
}

export const importExportAuditTrail = new ImportExportAuditTrail();
