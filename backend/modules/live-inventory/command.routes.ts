import { Router, type Request, type Response } from 'express';
import {
  enqueueCommand,
  generateCommandId,
  getPendingCommands,
  recordResult,
  removeCommand,
} from './commandStore';

export const createCommandRouter = () => {
  const router = Router();

  /** Agent polls for pending commands. */
  router.get('/agent/commands', (req: Request, res: Response) => {
    const hostname =
      typeof req.query.hostname === 'string' ? req.query.hostname.trim() : '';
    if (!hostname) {
      res.status(400).json({ success: false, errorMessage: 'Missing hostname query param' });
      return;
    }
    res.json(getPendingCommands(hostname));
  });

  /** Agent reports command execution result. */
  router.post('/agent/command-result', (req: Request, res: Response) => {
    const { hostname, commandId, status, output } = req.body ?? {};
    if (!hostname || !commandId) {
      res.status(400).json({ success: false, errorMessage: 'Missing hostname or commandId' });
      return;
    }

    recordResult({
      hostname,
      commandId,
      status: status === 'success' ? 'success' : 'failed',
      output: typeof output === 'string' ? output : '',
      receivedAt: Date.now(),
    });

    removeCommand(hostname, commandId);

    res.json({ success: true });
  });

  /** UI queues an arbitrary command for a given host. */
  router.post('/agent/queue-command', (req: Request, res: Response) => {
    const { hostname, action, payload } = req.body ?? {};
    if (!hostname || !action) {
      res.status(400).json({ success: false, errorMessage: 'Missing hostname or action' });
      return;
    }

    const cmd = {
      id: generateCommandId(),
      action,
      payload: payload && typeof payload === 'object' ? payload : {},
      createdAt: Date.now(),
    };

    enqueueCommand(hostname, cmd);
    res.json({ queued: true, command: cmd });
  });

  // ──────────────────────────────────────────────────
  // Test helper — enqueue a kill_process command
  // ──────────────────────────────────────────────────
  router.post('/test/kill-notepad', (req: Request, res: Response) => {
    const hostname =
      typeof req.query.hostname === 'string' ? req.query.hostname.trim() : '';
    if (!hostname) {
      res.status(400).json({ success: false, errorMessage: 'Missing hostname query param' });
      return;
    }

    const cmd = {
      id: generateCommandId(),
      action: 'kill_process',
      payload: { name: 'notepad.exe' },
      createdAt: Date.now(),
    };

    enqueueCommand(hostname, cmd);
    res.json({ queued: true, command: cmd });
  });

  return router;
};
