import express from 'express';
import { createAgentDistributionRouter } from '../modules/agent-distribution/agentDistribution.routes';
import { createAgentLifecycleRouter } from '../modules/live-inventory/agentLifecycle.routes';
import { createCommandRouter } from '../modules/live-inventory/command.routes';
import { createLiveInventoryRouter } from '../modules/live-inventory/liveInventory.routes';
import { createUsageRouter } from '../modules/live-inventory/usage.routes';

const PORT = Number(process.env.LOCAL_SERVICE_PORT ?? 3001);

const app = express();

// ── JSON body parsing ──
app.use(express.json({ limit: '2mb' }));

// ── CORS for localhost origins (Electron UI + dev server) ──
app.use((_req, res, next) => {
  const origin = _req.headers.origin ?? '';
  if (
    origin.startsWith('http://localhost') ||
    origin.startsWith('http://127.0.0.1')
  ) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (_req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

// ── Health check ──
app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'redlyea-local-service' });
});

// ── Mount live-inventory routes under /api ──
app.use('/api', createLiveInventoryRouter());

// ── Mount command channel routes under /api ──
app.use('/api', createCommandRouter());

// ── Mount usage analytics routes under /api ──
app.use('/api', createUsageRouter());

// ── Mount agent lifecycle routes (register, heartbeat, policies) under /api ──
app.use('/api', createAgentLifecycleRouter());

// ── Mount agent distribution routes (not under /api — direct path) ──
app.use(createAgentDistributionRouter());

// ── Fallback 404 for unhandled /api routes ──
app.use('/api', (_req, res) => {
  res.status(404).json({ success: false, errorMessage: 'Not Found' });
});

// ── Start ──
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`RedlyEA Local Service running on port ${PORT}`);
});
