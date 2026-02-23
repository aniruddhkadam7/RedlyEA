export interface ProcessUsageEntry {
  name: string;
  pid: number;
  timestamp: number;
}

export interface MachineInventory {
  hostname: string;
  os: string;
  installedApps: InstalledApp[];
  processes: RunningProcess[];
  lastSeen: string;
  /** Extended inventory sections (all optional for backward compat) */
  systemInfo?: SystemInfo;
  osInfo?: OsInfo;
  networkInterfaces?: NetworkInterface[];
  listeningPorts?: ListeningPort[];
  users?: LoggedInUser[];
  disks?: DiskDrive[];
  services?: WindowsService[];
  /** Periodic process-usage snapshots for tracking software usage over time */
  processUsage?: ProcessUsageEntry[];
  /** v3 native agent fields */
  startupPrograms?: StartupProgram[];
  patches?: WindowsPatch[];
  securityStatus?: SecurityStatus;
}

export interface InstalledApp {
  name: string;
  version?: string;
  vendor?: string;
}

export interface RunningProcess {
  pid: number;
  name: string;
  cpu?: number;
  memory?: number;
}

export interface SystemInfo {
  hostname?: string;
  computerName?: string;
  cpuBrand?: string;
  physicalMemory?: string;
}

export interface OsInfo {
  name?: string;
  version?: string;
  build?: string;
  arch?: string;
  lastBootTime?: string;
}

export interface NetworkInterface {
  interface?: string;
  address?: string;
  mac?: string;
}

export interface ListeningPort {
  address?: string;
  port?: number;
  pid?: number;
}

export interface LoggedInUser {
  user?: string;
  tty?: string;
  host?: string;
  time?: string;
}

export interface DiskDrive {
  device?: string;
  type?: string;
  size?: string;
  freeSpace?: string;
}

export interface WindowsService {
  name?: string;
  displayName?: string;
  status?: string;
  startType?: string;
}

/* ── v3 native agent types ── */

export interface StartupProgram {
  name?: string;
  command?: string;
  source?: string;
  type?: string;
}

export interface WindowsPatch {
  hotFixId?: string;
  description?: string;
  installedOn?: string;
  installedBy?: string;
}

export interface FirewallProfile {
  Name?: string;
  Enabled?: boolean;
}

export interface AntivirusProduct {
  name?: string;
  state?: number;
  path?: string;
}

export interface BitLockerVolume {
  drive?: string;
  protectionStatus?: string;
  encryptionMethod?: string;
  volumeStatus?: string;
  percentEncrypted?: number;
}

export interface DefenderStatus {
  realTimeProtection?: boolean;
  behaviorMonitoring?: boolean;
  ioavProtection?: boolean;
  signatureAge?: number;
}

export interface SecurityStatus {
  firewall?: FirewallProfile[];
  antivirus?: AntivirusProduct[];
  bitlocker?: BitLockerVolume[];
  uacEnabled?: boolean | null;
  defender?: DefenderStatus | null;
}
