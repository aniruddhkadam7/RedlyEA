import { request } from '@/utils/request';
import type { MachineInventory } from '../../../backend/modules/live-inventory/liveInventory.types';

export type InventoryApiResponse<T> = {
  success: boolean;
  data: T;
  errorMessage?: string;
};

export async function getInventoryMachines(options?: Record<string, any>) {
  return request<InventoryApiResponse<MachineInventory[]>>(
    '/api/inventory/machines',
    {
      method: 'GET',
      ...(options || {}),
    },
  );
}

/** Returns machines enriched with online/offline status based on heartbeat. */
export async function getMachinesWithStatus(options?: Record<string, any>) {
  return request<InventoryApiResponse<(MachineInventory & { status?: string })[]>>(
    '/api/machines/status',
    {
      method: 'GET',
      ...(options || {}),
    },
  );
}

export async function getInventoryMachineDetail(
  hostname: string,
  options?: Record<string, any>,
) {
  return request<InventoryApiResponse<MachineInventory>>(
    `/api/inventory/machines/${encodeURIComponent(hostname)}`,
    {
      method: 'GET',
      ...(options || {}),
    },
  );
}

export async function queueAgentCommand(
  hostname: string,
  action: string,
  payload?: Record<string, unknown>,
) {
  return request<{ queued: boolean; command: { id: string; action: string } }>(
    '/api/agent/queue-command',
    {
      method: 'POST',
      data: { hostname, action, payload: payload ?? {} },
    },
  );
}
