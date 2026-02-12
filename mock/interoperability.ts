import type { Request, Response } from 'express';

import type {
  CsvExportEngineResult,
  CsvImportEngineResult,
  CsvImportSourceEntity,
  ImportExportAuditRecord,
  ImportExportOperation,
  ImportExportOutcome,
  InteroperabilityReadinessResult,
} from '../backend/interoperability';
import {
  exportRepositoryToCsv,
  importCsvTransactional,
  importExportAuditTrail,
  runInteroperabilityReadinessCheck,
} from '../backend/interoperability';
import type { ExportScope } from '../backend/interoperability/ExportScope';

type ApiResponse<T> = {
  success: boolean;
  data: T;
  errorMessage?: string;
};

const normalize = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

const asInt = (value: unknown, fallback: number): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string') {
    const n = Number.parseInt(value, 10);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
};

const resolveActor = (req: Request) => {
  const actorId =
    normalize(req.headers['x-userid']) ||
    normalize(req.headers['x-user-id']) ||
    normalize(req.headers['x-actor-id']) ||
    'unknown';

  const displayName =
    normalize(req.headers['x-username']) ||
    normalize(req.headers['x-user-name']) ||
    normalize(req.headers['x-actor-name']) ||
    undefined;

  const access = normalize(req.headers['x-access']) || undefined;

  return { actorId, displayName, access };
};

const resolveRequestId = (req: Request) => normalize(req.headers['x-request-id']) || undefined;

const safePayloadBytes = (text: string): number => {
  try {
    // Node/Express environment (mock server).
    return Buffer.byteLength(text, 'utf8');
  } catch {
    return text.length;
  }
};

type AuditListResponse = ApiResponse<ImportExportAuditRecord[]>;
type AuditGetResponse = ApiResponse<ImportExportAuditRecord>;
type ReadinessResponse = ApiResponse<InteroperabilityReadinessResult>;

type CsvImportRequestBody = {
  entity: CsvImportSourceEntity;
  csvText: string;
  sourceDescription?: string;
};

type CsvExportRequestBody = {
  scope: ExportScope;
};

type ReadinessCheckRequestBody = {
  scope?: ExportScope;
  includeGovernanceChecks?: boolean;
  nowIso?: string;
};

export default {
  'POST /api/interoperability/import/csv/validate': (req: Request, res: Response<ApiResponse<CsvImportEngineResult>>) => {
    const body = (req.body ?? {}) as Partial<CsvImportRequestBody>;

    if (!body.entity || typeof body.csvText !== 'string') {
      res.status(400).send({
        success: false,
        data: {
          ok: false,
          errors: [
            {
              line: 1,
              code: 'MISSING_HEADER',
              message: 'Request must include entity and csvText.',
            },
          ],
        },
        errorMessage: 'Invalid request body.',
      });
      return;
    }

    const result = importCsvTransactional(
      [{ entity: body.entity, csvText: body.csvText, sourceDescription: body.sourceDescription }],
      { applyToRepository: false },
    );

    res.send({ success: true, data: result });
  },

  'POST /api/interoperability/import/csv/execute': (req: Request, res: Response<ApiResponse<CsvImportEngineResult>>) => {
    const body = (req.body ?? {}) as Partial<CsvImportRequestBody>;

    if (!body.entity || typeof body.csvText !== 'string') {
      res.status(400).send({
        success: false,
        data: {
          ok: false,
          errors: [
            {
              line: 1,
              code: 'MISSING_HEADER',
              message: 'Request must include entity and csvText.',
            },
          ],
        },
        errorMessage: 'Invalid request body.',
      });
      return;
    }

    const startedAt = new Date().toISOString();
    const result = importCsvTransactional(
      [{ entity: body.entity, csvText: body.csvText, sourceDescription: body.sourceDescription }],
      { applyToRepository: true },
    );
    const completedAt = new Date().toISOString();

    // Passive audit trail (metadata only). Must never block usage.
    try {
      importExportAuditTrail.record({
        requestId: resolveRequestId(req),
        operation: 'IMPORT',
        actor: resolveActor(req),
        startedAt,
        completedAt,
        scope: {
          sourceType: 'CSV',
          csvEntity: body.entity,
          sourceDescription: body.sourceDescription,
          payloadBytes: safePayloadBytes(body.csvText),
        },
        result: result.ok
          ? {
              outcome: 'SUCCESS',
              importedElementsCount: result.importedElementsCount,
              importedRelationshipsCount: result.importedRelationshipsCount,
              warningCount: 0,
              errorCount: 0,
            }
          : {
              outcome: 'FAILURE',
              importedElementsCount: 0,
              importedRelationshipsCount: 0,
              warningCount: 0,
              errorCount: result.errors.length,
              errorDigest: result.errors.slice(0, 25).map((e) => ({
                code: e.code,
                message: e.message,
                line: e.line,
                column: e.column,
              })),
            },
      });
    } catch {
      // Best-effort only.
    }

    res.send({ success: true, data: result });
  },

  'POST /api/interoperability/export/csv': (req: Request, res: Response<ApiResponse<CsvExportEngineResult>>) => {
    const body = (req.body ?? {}) as Partial<CsvExportRequestBody>;

    if (!body.scope) {
      res.status(400).send({
        success: false,
        data: { ok: false, errors: ['Request must include scope.'] },
        errorMessage: 'Invalid request body.',
      });
      return;
    }

    const startedAt = new Date().toISOString();
    const result = exportRepositoryToCsv(body.scope);
    const completedAt = new Date().toISOString();

    // Passive audit trail (metadata only). Must never block usage.
    try {
      importExportAuditTrail.record({
        requestId: resolveRequestId(req),
        operation: 'EXPORT',
        actor: resolveActor(req),
        startedAt,
        completedAt,
        scope: {
          exportType: body.scope.exportType,
          includedElementTypes: body.scope.includedElementTypes,
          includedRelationshipTypes: body.scope.includedRelationshipTypes,
          includeViews: body.scope.includeViews,
          includeGovernanceArtifacts: body.scope.includeGovernanceArtifacts,
          format: 'CSV',
        },
        result: result.ok
          ? {
              outcome: 'SUCCESS',
              exportedElementsCount: result.exportedElementsCount,
              exportedRelationshipsCount: result.exportedRelationshipsCount,
              warningCount: result.warnings.length,
              errorCount: 0,
            }
          : {
              outcome: 'FAILURE',
              exportedElementsCount: 0,
              exportedRelationshipsCount: 0,
              warningCount: 0,
              errorCount: result.errors.length,
              errorDigest: result.errors.slice(0, 25).map((e) => ({ message: e })),
            },
      });
    } catch {
      // Best-effort only.
    }

    res.send({ success: true, data: result });
  },

  'GET /api/interoperability/audit': (req: Request, res: Response<AuditListResponse>) => {
    const limit = asInt((req.query as any)?.limit, 50);

    const operation = normalize((req.query as any)?.operation) as ImportExportOperation;
    const outcome = normalize((req.query as any)?.outcome) as ImportExportOutcome;

    const opFilter: ImportExportOperation | undefined = operation === 'IMPORT' || operation === 'EXPORT' ? operation : undefined;
    const outFilter: ImportExportOutcome | undefined = outcome === 'SUCCESS' || outcome === 'FAILURE' ? outcome : undefined;

    const records = importExportAuditTrail.listRecent(limit, { operation: opFilter, outcome: outFilter });
    res.send({ success: true, data: records });
  },

  'GET /api/interoperability/audit/:auditId': (req: Request, res: Response<AuditGetResponse>) => {
    const auditId = normalize((req.params as any)?.auditId);
    const record = importExportAuditTrail.getByAuditId(auditId);
    if (!record) {
      res.status(404).send({ success: false, errorMessage: 'Audit record not found.' } as any);
      return;
    }
    res.send({ success: true, data: record });
  },

  'POST /api/interoperability/readiness/check': (req: Request, res: Response<ReadinessResponse>) => {
    const body = (req.body ?? {}) as Partial<ReadinessCheckRequestBody>;

    const result = runInteroperabilityReadinessCheck({
      scope: body.scope,
      includeGovernanceChecks: body.includeGovernanceChecks,
      nowIso: body.nowIso,
    });

    res.send({ success: true, data: result });
  },
};
