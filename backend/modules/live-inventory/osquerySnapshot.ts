import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';

import { upsertMachine } from './liveInventory.store';

type OsqueryRow = Record<string, string | number | null>;

const MIN_SYNC_INTERVAL_MS = 15_000;
let lastSyncMs = 0;

function resolveOsqueryBinary(): string | null {
  const candidates = [
    process.env.OSQUERYI_PATH,
    'C:\\Program Files\\osquery\\osqueryi.exe',
    'C:\\Program Files\\osquery\\osqueryd\\osqueryi.exe',
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
}

function runOsqueryQuery(osqueryPath: string, sql: string): OsqueryRow[] {
  try {
    const stdout = execFileSync(osqueryPath, ['--json', sql], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const parsed = JSON.parse(stdout) as unknown;
    return Array.isArray(parsed) ? (parsed as OsqueryRow[]) : [];
  } catch {
    return [];
  }
}

function asString(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

function asNumber(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function collectLocalSnapshot(): Record<string, unknown> | null {
  const osqueryPath = resolveOsqueryBinary();
  if (!osqueryPath) return null;

  const systemInfo =
    runOsqueryQuery(
      osqueryPath,
      'select hostname, computer_name, cpu_brand, physical_memory from system_info limit 1;',
    )[0] ?? {};
  const osVersion =
    runOsqueryQuery(
      osqueryPath,
      'select name, version, build from os_version limit 1;',
    )[0] ?? {};

  const hostname =
    asString(systemInfo.computer_name) ||
    asString(systemInfo.hostname) ||
    os.hostname();

  const osName = asString(osVersion.name);
  const version = asString(osVersion.version);
  const build = asString(osVersion.build);
  const osLabel = `${osName} ${version}${build ? ` (${build})` : ''}`.trim();

  const installedApps = runOsqueryQuery(
    osqueryPath,
    'select name, version, publisher from programs limit 3000;',
  )
    .map((row) => ({
      name: asString(row.name),
      version: asString(row.version) || undefined,
      vendor: asString(row.publisher) || undefined,
    }))
    .filter((app) => app.name);

  const processes = runOsqueryQuery(
    osqueryPath,
    'select pid, name, resident_size from processes limit 1500;',
  )
    .map((row) => ({
      pid: asNumber(row.pid) ?? 0,
      name: asString(row.name),
      memory: asNumber(row.resident_size),
    }))
    .filter((proc) => proc.pid > 0 && proc.name);

  const services = runOsqueryQuery(
    osqueryPath,
    'select name, display_name, status, start_type from services limit 1000;',
  ).map((row) => ({
    name: asString(row.name) || undefined,
    displayName: asString(row.display_name) || undefined,
    status: asString(row.status) || undefined,
    startType: asString(row.start_type) || undefined,
  }));

  const listeningPorts = runOsqueryQuery(
    osqueryPath,
    'select address, port, pid from listening_ports limit 2000;',
  ).map((row) => ({
    address: asString(row.address) || undefined,
    port: asNumber(row.port),
    pid: asNumber(row.pid),
  }));

  const networkInterfaces = runOsqueryQuery(
    osqueryPath,
    'select interface, address, mask from interface_addresses limit 500;',
  ).map((row) => ({
    interface: asString(row.interface) || undefined,
    address: asString(row.address) || undefined,
    mac: asString(row.mask) || undefined,
  }));

  const users = runOsqueryQuery(
    osqueryPath,
    'select user, tty, host, time from logged_in_users limit 500;',
  ).map((row) => ({
    user: asString(row.user) || undefined,
    tty: asString(row.tty) || undefined,
    host: asString(row.host) || undefined,
    time: asString(row.time) || undefined,
  }));

  const disks = runOsqueryQuery(
    osqueryPath,
    'select device_id, drive_type, size, free_space from logical_drives limit 200;',
  ).map((row) => ({
    device: asString(row.device_id) || undefined,
    type: asString(row.drive_type) || undefined,
    size: asString(row.size) || undefined,
    freeSpace: asString(row.free_space) || undefined,
  }));

  const startupPrograms = runOsqueryQuery(
    osqueryPath,
    'select name, path, type, source from startup_items limit 1000;',
  ).map((row) => ({
    name: asString(row.name) || undefined,
    command: asString(row.path) || undefined,
    source: asString(row.source) || undefined,
    type: asString(row.type) || undefined,
  }));

  const patches = runOsqueryQuery(
    osqueryPath,
    'select hotfix_id, description, installed_on from patches limit 1000;',
  ).map((row) => ({
    hotFixId: asString(row.hotfix_id) || undefined,
    description: asString(row.description) || undefined,
    installedOn: asString(row.installed_on) || undefined,
  }));

  return {
    hostname,
    username: process.env.USERNAME ?? '',
    os: osLabel || `${os.type()} ${os.release()}`,
    agentVersion: 'osquery-local',
    source: 'osquery-live',
    status: 'online',
    registeredAt: new Date().toISOString(),
    installedApps,
    processes,
    services,
    listeningPorts,
    networkInterfaces,
    users,
    disks,
    startupPrograms,
    patches,
  };
}

export function syncLocalOsqueryMachineIfNeeded(force = false): boolean {
  const now = Date.now();
  if (!force && now - lastSyncMs < MIN_SYNC_INTERVAL_MS) {
    return false;
  }

  const snapshot = collectLocalSnapshot();
  if (!snapshot) return false;

  upsertMachine(snapshot);
  lastSyncMs = now;
  return true;
}
