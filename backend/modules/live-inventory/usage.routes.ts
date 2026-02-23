import { Router } from 'express';
import { getApplicationUsageSummary } from './usageAnalytics';

/**
 * Routes for the usage-analytics layer.
 *
 *   GET /usage/applications  — aggregated per-application usage stats
 */
export function createUsageRouter(): Router {
  const router = Router();

  router.get('/usage/applications', (_req, res) => {
    try {
      const data = getApplicationUsageSummary();
      res.json({ success: true, data });
    } catch (err: any) {
      res.status(500).json({ success: false, errorMessage: err?.message ?? 'Unknown error' });
    }
  });

  return router;
}
