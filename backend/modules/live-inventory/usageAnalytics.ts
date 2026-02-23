/**
 * Usage analytics service — computes aggregated application-usage insights
 * from the processUsage snapshots stored per machine.
 *
 * Pure read-only analytics layer — does NOT modify inventory data.
 */

import { getAllMachines } from './liveInventory.store';

// ── Types ──

export interface AppUsageSummary {
  name: string;
  /** Number of distinct machines that observed this process */
  machines: number;
  /** Most recent observation timestamp (epoch ms) across all machines */
  lastSeen: number;
  /** Total observation count across all machines */
  observations: number;
  /** Number of unique calendar days observed */
  daysObserved: number;
  /** Derived classification */
  usage: 'Frequent' | 'Occasional' | 'Rare';
}

// ── Helpers ──

interface ProcessUsageEntry {
  name?: string;
  pid?: number;
  timestamp?: number;
}

function classify(observations: number): 'Frequent' | 'Occasional' | 'Rare' {
  if (observations > 100) return 'Frequent';
  if (observations >= 10) return 'Occasional';
  return 'Rare';
}

function uniqueDays(timestamps: number[]): number {
  const daySet = new Set<string>();
  for (const ts of timestamps) {
    daySet.add(new Date(ts).toISOString().slice(0, 10)); // "YYYY-MM-DD"
  }
  return daySet.size;
}

// ── Public API ──

/**
 * Aggregate processUsage across every stored machine and return
 * per-application summary statistics.
 */
export function getApplicationUsageSummary(): AppUsageSummary[] {
  const machines = getAllMachines();

  // Accumulator keyed by process name
  const acc = new Map<
    string,
    { machineSet: Set<string>; timestamps: number[]; count: number }
  >();

  for (const machine of machines) {
    const hostname = (machine.hostname as string) ?? 'unknown';
    const entries = machine.processUsage as ProcessUsageEntry[] | undefined;
    if (!Array.isArray(entries)) continue;

    for (const entry of entries) {
      const name = entry.name;
      if (!name) continue;

      let bucket = acc.get(name);
      if (!bucket) {
        bucket = { machineSet: new Set(), timestamps: [], count: 0 };
        acc.set(name, bucket);
      }

      bucket.machineSet.add(hostname);
      bucket.count += 1;
      if (typeof entry.timestamp === 'number') {
        bucket.timestamps.push(entry.timestamp);
      }
    }
  }

  // Build sorted result
  const result: AppUsageSummary[] = [];

  for (const [name, bucket] of acc) {
    const lastSeen =
      bucket.timestamps.length > 0 ? Math.max(...bucket.timestamps) : 0;

    result.push({
      name,
      machines: bucket.machineSet.size,
      lastSeen,
      observations: bucket.count,
      daysObserved: uniqueDays(bucket.timestamps),
      usage: classify(bucket.count),
    });
  }

  // Sort by observation count descending (most used first)
  result.sort((a, b) => b.observations - a.observations);

  return result;
}
