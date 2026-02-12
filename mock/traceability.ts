import type { Request, Response } from 'express';

import { getGraphAbstractionLayer } from '../backend/graph/GraphAbstractionLayerStore';
import { getViewRepository } from '../backend/views/ViewRepositoryStore';
import { getAdrRepository } from '../backend/adr/AdrRepositoryStore';
import { TraceabilityMatrix } from '../backend/traceability/TraceabilityMatrix';
import { DomainError } from '../backend/reliability/DomainError';
import { mapErrorToApiResponse } from '../backend/reliability/FailureHandling';

const makeMatrix = () =>
  new TraceabilityMatrix({
    graph: getGraphAbstractionLayer(),
    views: getViewRepository(),
    adrs: getAdrRepository(),
  });

const normalizeId = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

export default {
  'GET /api/traceability/capability/:capabilityId': async (req: Request, res: Response) => {
    try {
      const capabilityId = normalizeId((req.params as any)?.capabilityId);
      if (!capabilityId) {
        throw new DomainError({ code: 'VALIDATION_ERROR', message: 'capabilityId is required.', retryable: false });
      }
      const matrix = makeMatrix();
      res.send({ success: true, data: await matrix.traceCapabilityToApplicationToTechnology(capabilityId) });
    } catch (err) {
      const mapped = mapErrorToApiResponse(err, { operation: 'traceability.capability' });
      res.status(mapped.status).send(mapped.body);
    }
  },

  'GET /api/traceability/programme/:programmeId': async (req: Request, res: Response) => {
    try {
      const programmeId = normalizeId((req.params as any)?.programmeId);
      if (!programmeId) {
        throw new DomainError({ code: 'VALIDATION_ERROR', message: 'programmeId is required.', retryable: false });
      }
      const matrix = makeMatrix();
      res.send({ success: true, data: await matrix.traceProgrammeImpact(programmeId) });
    } catch (err) {
      const mapped = mapErrorToApiResponse(err, { operation: 'traceability.programme' });
      res.status(mapped.status).send(mapped.body);
    }
  },

  'GET /api/traceability/adr/:adrId': async (req: Request, res: Response) => {
    try {
      const adrId = normalizeId((req.params as any)?.adrId);
      if (!adrId) throw new DomainError({ code: 'VALIDATION_ERROR', message: 'adrId is required.', retryable: false });
      const matrix = makeMatrix();
      res.send({ success: true, data: await matrix.traceAdrImpactedElements(adrId) });
    } catch (err: any) {
      // Preserve prior semantics for project scoping failures.
      if ((err?.message ?? '').toLowerCase().includes('no active project')) {
        res.status(409).send({ success: false, errorMessage: err?.message || 'No active project.' });
        return;
      }
      const mapped = mapErrorToApiResponse(err, { operation: 'traceability.adr' });
      res.status(mapped.status).send(mapped.body);
    }
  },
};
