import type { Request, Response } from 'express';

import type { ArchitectureReviewState, ArchitectureReviewUpsertInput } from '../backend/review/ArchitectureReview';
import { getArchitectureReviewStore } from '../backend/review/ArchitectureReviewStore';

const normalizeId = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const asState = (value: unknown): ArchitectureReviewState | null => {
  if (value === 'Not Reviewed' || value === 'Reviewed' || value === 'Review Findings Accepted') return value;
  if (typeof value === 'string') {
    const v = value.trim();
    if (v === 'Not Reviewed' || v === 'Reviewed' || v === 'Review Findings Accepted') return v;
  }
  return null;
};

export default {
  'GET /api/reviews/:subjectKind/:subjectId': (req: Request, res: Response) => {
    const subjectKind = normalizeId((req.params as any)?.subjectKind);
    const subjectId = normalizeId((req.params as any)?.subjectId);

    const allowedKind = subjectKind === 'View' || subjectKind === 'ImpactAnalysis' ? subjectKind : null;
    if (!allowedKind || !subjectId) {
      res.status(400).send({ success: false, errorMessage: 'subjectKind and subjectId are required.' });
      return;
    }

    const record = getArchitectureReviewStore().get(allowedKind, subjectId);
    res.send({ success: true, data: record });
  },

  'PUT /api/reviews/:subjectKind/:subjectId': (req: Request, res: Response) => {
    const subjectKind = normalizeId((req.params as any)?.subjectKind);
    const subjectId = normalizeId((req.params as any)?.subjectId);

    const allowedKind = subjectKind === 'View' || subjectKind === 'ImpactAnalysis' ? subjectKind : null;
    if (!allowedKind || !subjectId) {
      res.status(400).send({ success: false, errorMessage: 'subjectKind and subjectId are required.' });
      return;
    }

    const body = (req.body ?? {}) as ArchitectureReviewUpsertInput;
    const state = asState((body as any).state);
    if (!state) {
      res.status(400).send({ success: false, errorMessage: 'state is required.' });
      return;
    }

    const updated = getArchitectureReviewStore().upsert({
      subjectKind: allowedKind,
      subjectId,
      input: {
        state,
        reviewer: typeof (body as any).reviewer === 'string' ? (body as any).reviewer : undefined,
        reviewNotes: typeof (body as any).reviewNotes === 'string' ? (body as any).reviewNotes : undefined,
        reviewDate: typeof (body as any).reviewDate === 'string' ? (body as any).reviewDate : undefined,
      },
      now: new Date(),
    });

    res.send({ success: true, data: updated });
  },
};
