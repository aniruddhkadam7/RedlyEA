import type { Request, Response } from 'express';

import type {
  ArchitectureDecisionRecordUpsertInput,
  ArchitectureDecisionRecord,
} from '../backend/adr/ArchitectureDecisionRecord';
import { deleteAdr, getAdrRepository, upsertAdr } from '../backend/adr/AdrRepositoryStore';

const normalizeId = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

export default {
  'GET /api/adrs': (_req: Request, res: Response) => {
    try {
      const list = getAdrRepository().listAll();
      res.send({ success: true, data: list });
    } catch (e: any) {
      res.status(409).send({ success: false, errorMessage: e?.message || 'No active project.' });
    }
  },

  'GET /api/adrs/:adrId': (req: Request, res: Response) => {
    const adrId = normalizeId((req.params as any)?.adrId);
    if (!adrId) {
      res.status(400).send({ success: false, errorMessage: 'adrId is required.' });
      return;
    }

    try {
      const adr = getAdrRepository().getById(adrId);
      if (!adr) {
        res.status(404).send({ success: false, errorMessage: 'ADR not found.' });
        return;
      }
      res.send({ success: true, data: adr });
    } catch (e: any) {
      res.status(409).send({ success: false, errorMessage: e?.message || 'No active project.' });
    }
  },

  'POST /api/adrs': (req: Request, res: Response) => {
    const body = (req.body ?? {}) as ArchitectureDecisionRecordUpsertInput;

    try {
      const result = upsertAdr(body);
      if (!result.ok) {
        res.status(400).send({ success: false, errorMessage: result.error });
        return;
      }

      const statusCode = result.created ? 201 : 200;
      res.status(statusCode).send({ success: true, data: result.adr });
    } catch (e: any) {
      res.status(409).send({ success: false, errorMessage: e?.message || 'No active project.' });
    }
  },

  'PUT /api/adrs/:adrId': (req: Request, res: Response) => {
    const adrId = normalizeId((req.params as any)?.adrId);
    if (!adrId) {
      res.status(400).send({ success: false, errorMessage: 'adrId is required.' });
      return;
    }

    const body = (req.body ?? {}) as ArchitectureDecisionRecordUpsertInput;

    try {
      const result = upsertAdr({ ...body, adrId });
      if (!result.ok) {
        res.status(400).send({ success: false, errorMessage: result.error });
        return;
      }

      res.send({ success: true, data: result.adr });
    } catch (e: any) {
      res.status(409).send({ success: false, errorMessage: e?.message || 'No active project.' });
    }
  },

  'DELETE /api/adrs/:adrId': (req: Request, res: Response) => {
    const adrId = normalizeId((req.params as any)?.adrId);
    if (!adrId) {
      res.status(400).send({ success: false, errorMessage: 'adrId is required.' });
      return;
    }

    try {
      const existed = deleteAdr(adrId);
      if (!existed) {
        res.status(404).send({ success: false, errorMessage: 'ADR not found.' });
        return;
      }
      res.send({ success: true, data: true });
    } catch (e: any) {
      res.status(409).send({ success: false, errorMessage: e?.message || 'No active project.' });
    }
  },
};
