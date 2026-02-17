import type { Request, Response } from 'express';

import { telemetryStore } from '../backend/telemetry/TelemetryStore';

const asInt = (value: unknown, fallback: number): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string') {
    const n = Number.parseInt(value, 10);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
};

export default {
  // Internal-only: not surfaced in UI.
  'GET /api/internal/metrics': (_req: Request, res: Response) => {
    res.send({ success: true, data: telemetryStore.snapshot() });
  },

  'GET /api/internal/metrics/events': (req: Request, res: Response) => {
    const limit = asInt((req.query as any)?.limit, 200);
    res.send({ success: true, data: telemetryStore.listRecent(limit) });
  },

  'POST /api/internal/metrics/reset': (_req: Request, res: Response) => {
    telemetryStore.reset();
    res.send({ success: true, data: { ok: true } });
  },
};
