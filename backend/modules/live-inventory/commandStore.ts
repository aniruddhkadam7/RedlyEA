export interface PendingCommand {
  id: string;
  action: string;
  payload: Record<string, unknown>;
  createdAt: number;
}

export interface CommandResult {
  hostname: string;
  commandId: string;
  status: 'success' | 'failed';
  output: string;
  receivedAt: number;
}

/**
 * In-memory command queue, keyed by hostname.
 * No persistence — data lives only while the server process is running.
 */
const commandsByHost = new Map<string, PendingCommand[]>();

/**
 * Completed command results (append-only log).
 */
const commandResults: CommandResult[] = [];

let cmdCounter = 0;

export function generateCommandId(): string {
  cmdCounter += 1;
  return `cmd-${Date.now()}-${cmdCounter}`;
}

export function enqueueCommand(hostname: string, command: PendingCommand): void {
  const queue = commandsByHost.get(hostname) ?? [];
  queue.push(command);
  commandsByHost.set(hostname, queue);
}

export function getPendingCommands(hostname: string): PendingCommand[] {
  return commandsByHost.get(hostname) ?? [];
}

export function removeCommand(hostname: string, commandId: string): void {
  const queue = commandsByHost.get(hostname);
  if (!queue) return;
  const idx = queue.findIndex((c) => c.id === commandId);
  if (idx !== -1) queue.splice(idx, 1);
}

export function recordResult(result: CommandResult): void {
  commandResults.push(result);
}

export function getResults(): CommandResult[] {
  return commandResults;
}
