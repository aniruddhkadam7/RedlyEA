/**
 * In-memory store for live inventory data, keyed by hostname.
 * No persistence — data lives only while the server process is running.
 *
 * Stores whatever JSON the agent sends — no field restrictions.
 */
const machines = new Map<string, Record<string, unknown>>();

export function upsertMachine(data: Record<string, unknown>): void {
  machines.set(data.hostname as string, { ...data, lastSeen: new Date().toISOString() });
}

export function getAllMachines(): Record<string, unknown>[] {
  return Array.from(machines.values());
}

export function getMachineByHostname(
  hostname: string,
): Record<string, unknown> | undefined {
  return machines.get(hostname);
}
