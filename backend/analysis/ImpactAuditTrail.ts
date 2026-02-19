import type {
  ImpactAnalysisAuditRecord,
  ImpactAnalysisParameters,
} from './ImpactAudit';

const normalizeId = (value: string) => (value ?? '').trim();
const compareStrings = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * In-memory audit trail for impact analysis runs.
 *
 * Notes:
 * - Stores metadata only (never stores paths, rankings, or full outputs).
 * - Resets on refresh/server restart.
 */
export class ImpactAuditTrail {
  private readonly maxRecords: number;
  private readonly records: ImpactAnalysisAuditRecord[] = [];
  private counter = 0;

  constructor(maxRecords = 200) {
    this.maxRecords = Math.max(1, Math.trunc(maxRecords));
  }

  record(run: {
    requestId: string;
    repositoryName?: string;
    ranBy: string;
    ranAt: string;
    parameters: ImpactAnalysisParameters;
  }): ImpactAnalysisAuditRecord {
    this.counter += 1;

    const requestId = normalizeId(run.requestId);
    const repositoryName = String(run.repositoryName ?? '').trim();
    const ranBy = String(run.ranBy ?? '').trim() || 'unknown';
    const ranAt = String(run.ranAt ?? '').trim();

    const auditId = `audit_${this.counter}_${requestId || 'no-request-id'}`;

    const record: ImpactAnalysisAuditRecord = {
      auditId,
      requestId,
      ...(repositoryName ? { repositoryName } : {}),
      ranBy,
      ranAt,
      parameters: {
        rootElementId: normalizeId(run.parameters.rootElementId),
        rootElementType: String(run.parameters.rootElementType ?? '').trim(),
        direction: run.parameters.direction,
        maxDepth: Math.max(0, Math.trunc(run.parameters.maxDepth)),
        includedRelationshipTypes: (
          run.parameters.includedRelationshipTypes ?? []
        )
          .map((t) => String(t ?? '').trim())
          .filter((t) => t.length > 0)
          .slice()
          .sort(compareStrings),
        analysisIntent: run.parameters.analysisIntent,
        includePaths: Boolean(run.parameters.includePaths),
      },
    };

    this.records.push(record);
    if (this.records.length > this.maxRecords) {
      this.records.splice(0, this.records.length - this.maxRecords);
    }

    return record;
  }

  listRecent(limit = 50): ImpactAnalysisAuditRecord[] {
    const n = Math.max(1, Math.trunc(limit));
    const slice = this.records.slice(Math.max(0, this.records.length - n));
    return slice.reverse();
  }

  getByAuditId(auditId: string): ImpactAnalysisAuditRecord | null {
    const id = normalizeId(auditId);
    if (!id) return null;
    return this.records.find((r) => r.auditId === id) ?? null;
  }
}

export const impactAuditTrail = new ImpactAuditTrail();
