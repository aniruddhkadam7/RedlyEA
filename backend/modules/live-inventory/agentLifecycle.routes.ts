import { Router, type Request, type Response } from 'express';
import { upsertMachine, getMachineByHostname, getAllMachines } from './liveInventory.store';
import { enqueueCommand, generateCommandId, getPendingCommands } from './commandStore';

// ── Policy store (in-memory) ──

export interface Policy {
  id: string;
  type: 'prohibited_software' | 'required_software' | 'service_state' | 'firewall_required';
  target: string;          // e.g. "anydesk.exe", "Notepad++", "wuauserv"
  action: string;          // e.g. "kill_process", "report", "restart_service"
  desiredState?: string;   // for service_state: "running" | "stopped"
  enabled: boolean;
  createdAt: number;
}

export interface PolicyViolation {
  policyId: string;
  hostname: string;
  type: string;
  target: string;
  action: string;
  count?: number;
  detail?: string;
  remediated: boolean;
  timestamp: number;
}

const policies: Policy[] = [];
const policyViolations: PolicyViolation[] = [];
let policyCounter = 0;

// ── Helpers ──

const ONLINE_THRESHOLD_MS = 90_000; // 90 s — 3 missed heartbeats → offline

function isOnline(lastSeen: unknown): boolean {
  if (typeof lastSeen !== 'string') return false;
  return Date.now() - new Date(lastSeen).getTime() < ONLINE_THRESHOLD_MS;
}

/**
 * Evaluate policies against a machine's latest inventory.
 * Automatically enqueues commands when violations are found.
 */
function evaluatePolicies(hostname: string, machine: Record<string, unknown>): void {
  const processes = machine.processes as Array<{ name?: string }> | undefined;
  if (!Array.isArray(processes)) return;

  const processNames = new Set(processes.map((p) => (p.name ?? '').toLowerCase()));

  for (const policy of policies) {
    if (!policy.enabled) continue;

    if (policy.type === 'prohibited_software') {
      const target = policy.target.toLowerCase();
      if (processNames.has(target)) {
        // Check: don't double-queue if an identical command is already pending
        const pending = getPendingCommands(hostname);
        const alreadyQueued = pending.some(
          (c) => c.action === policy.action && (c.payload as Record<string, unknown>)?.name === policy.target,
        );
        if (!alreadyQueued) {
          enqueueCommand(hostname, {
            id: generateCommandId(),
            action: policy.action,
            payload: { name: policy.target, policyId: policy.id },
            createdAt: Date.now(),
          });
        }
      }
    }
  }
}

// ── Router ──

export function createAgentLifecycleRouter(): Router {
  const router = Router();

  // ═══════════════════════════════════════════════
  //  AGENT REGISTRATION
  // ═══════════════════════════════════════════════

  router.post('/agent/register', (req: Request, res: Response) => {
    const { hostname, username, os, agentVersion, ipAddress } = req.body ?? {};
    if (!hostname || typeof hostname !== 'string') {
      res.status(400).json({ registered: false, errorMessage: 'Missing hostname' });
      return;
    }

    // Create / update machine entry
    upsertMachine({
      hostname: hostname.trim(),
      username: username ?? '',
      os: os ?? '',
      agentVersion: agentVersion ?? '',
      ipAddress: ipAddress ?? '',
      registeredAt: new Date().toISOString(),
      status: 'online',
    });

    res.json({ registered: true });
  });

  // ═══════════════════════════════════════════════
  //  HEARTBEAT
  // ═══════════════════════════════════════════════

  router.post('/agent/heartbeat', (req: Request, res: Response) => {
    const { hostname } = req.body ?? {};
    if (!hostname || typeof hostname !== 'string') {
      res.status(400).json({ success: false, errorMessage: 'Missing hostname' });
      return;
    }

    const existing = getMachineByHostname(hostname.trim());
    if (existing) {
      upsertMachine({ ...existing, hostname: hostname.trim() });
    } else {
      // Auto-register if first contact is heartbeat
      upsertMachine({ hostname: hostname.trim(), status: 'online' });
    }

    res.json({ success: true });
  });

  // ═══════════════════════════════════════════════
  //  MACHINE STATUS (with online/offline)
  // ═══════════════════════════════════════════════

  router.get('/machines/status', (_req: Request, res: Response) => {
    const machines = getAllMachines().map((m) => ({
      ...m,
      status: isOnline(m.lastSeen) ? 'online' : 'offline',
    }));
    res.json({ success: true, data: machines });
  });

  // ═══════════════════════════════════════════════
  //  POLICY ENGINE
  // ═══════════════════════════════════════════════

  /** List all policies. */
  router.get('/policies', (_req: Request, res: Response) => {
    res.json({ success: true, data: policies });
  });

  /** Create a policy. */
  router.post('/policies', (req: Request, res: Response) => {
    const { type, target, action, enabled, desiredState } = req.body ?? {};
    if (!type || !target || !action) {
      res.status(400).json({ success: false, errorMessage: 'Missing type, target, or action' });
      return;
    }

    policyCounter += 1;
    const policy: Policy = {
      id: `pol-${Date.now()}-${policyCounter}`,
      type,
      target,
      action,
      desiredState: desiredState || undefined,
      enabled: enabled !== false,
      createdAt: Date.now(),
    };
    policies.push(policy);
    res.json({ success: true, policy });
  });

  /** Toggle a policy's enabled state. */
  router.post('/policies/:policyId/toggle', (req: Request, res: Response) => {
    const pol = policies.find((p) => p.id === req.params.policyId);
    if (!pol) {
      res.status(404).json({ success: false, errorMessage: 'Policy not found' });
      return;
    }
    pol.enabled = !pol.enabled;
    res.json({ success: true, policy: pol });
  });

  /** Delete a policy. */
  router.delete('/policies/:policyId', (req: Request, res: Response) => {
    const idx = policies.findIndex((p) => p.id === req.params.policyId);
    if (idx === -1) {
      res.status(404).json({ success: false, errorMessage: 'Policy not found' });
      return;
    }
    policies.splice(idx, 1);
    res.json({ success: true });
  });

  /**
   * Hook: evaluate policies whenever inventory is ingested.
   * Called externally from inventory route after storing data.
   */
  router.post('/internal/evaluate-policies', (req: Request, res: Response) => {
    const { hostname } = req.body ?? {};
    if (!hostname) { res.json({ evaluated: false }); return; }
    const machine = getMachineByHostname(hostname);
    if (machine) evaluatePolicies(hostname, machine);
    res.json({ evaluated: true });
  });

  // ═══════════════════════════════════════════════
  //  POLICY VIOLATIONS (reported by agent v3+)
  // ═══════════════════════════════════════════════

  /** Agent reports policy violations after local enforcement. */
  router.post('/agent/policy-violations', (req: Request, res: Response) => {
    const { hostname, violations, timestamp } = req.body ?? {};
    if (!hostname || !Array.isArray(violations)) {
      res.status(400).json({ success: false, errorMessage: 'Missing hostname or violations array' });
      return;
    }
    for (const v of violations) {
      policyViolations.push({
        policyId: v.policyId || '',
        hostname,
        type: v.type || '',
        target: v.target || '',
        action: v.action || '',
        count: v.count,
        detail: v.detail,
        remediated: v.remediated === true,
        timestamp: v.timestamp || timestamp || Date.now(),
      });
    }
    // Keep last 500 violations
    while (policyViolations.length > 500) policyViolations.shift();
    res.json({ success: true, stored: violations.length });
  });

  /** List recent policy violations. */
  router.get('/policy-violations', (req: Request, res: Response) => {
    const hostname = typeof req.query.hostname === 'string' ? req.query.hostname : undefined;
    let data = policyViolations;
    if (hostname) {
      data = data.filter((v) => v.hostname === hostname);
    }
    res.json({ success: true, data: data.slice(-100) });
  });

  return router;
}

// Export for direct use by inventory ingestion
export { evaluatePolicies, isOnline };
