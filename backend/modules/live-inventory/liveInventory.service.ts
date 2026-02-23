import {
  getAllMachines,
  getMachineByHostname,
  upsertMachine,
} from './liveInventory.store';
import { evaluatePolicies } from './agentLifecycle.routes';

/**
 * Ingest the full agent payload.
 * Only requirement: `hostname` must be a non-empty string.
 * Everything else is stored as-is — no field mapping, no dropping.
 * After storing, policies are evaluated automatically.
 */
export function ingestMachineInventory(payload: unknown): {
  success: boolean;
  errorMessage?: string;
} {
  if (!payload || typeof payload !== 'object') {
    return { success: false, errorMessage: 'Invalid payload' };
  }

  const body = payload as Record<string, unknown>;

  if (typeof body.hostname !== 'string' || !body.hostname.trim()) {
    return { success: false, errorMessage: 'Missing or empty hostname' };
  }

  // Store the entire payload verbatim + lastSeen
  upsertMachine({ ...body, hostname: body.hostname.trim() });

  // Evaluate server-side policies (e.g. prohibited software)
  try {
    const machine = getMachineByHostname(body.hostname as string);
    if (machine) evaluatePolicies(body.hostname as string, machine);
  } catch { /* policy evaluation is best-effort */ }

  return { success: true };
}

export function listMachines() {
  return getAllMachines();
}

export function getMachineDetail(hostname: string) {
  return getMachineByHostname(hostname);
}
