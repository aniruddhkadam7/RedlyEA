type Numeric = number;

export type TelemetryEvent = {
  ts: string;
  name: string;
  durationMs?: number;
  tags?: Record<string, string | number | boolean | null | undefined>;
  metrics?: Record<string, Numeric | null | undefined>;
  message?: string;
};

type DurationAggregate = {
  count: number;
  sumMs: number;
  maxMs: number;
};

type NumericAggregate = {
  count: number;
  sum: number;
  max: number;
};

const compareStrings = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const nowIso = () => new Date().toISOString();

const safeNumber = (value: unknown): number | null => {
  if (typeof value !== 'number') return null;
  if (!Number.isFinite(value)) return null;
  return value;
};

export class TelemetryStore {
  private readonly maxEvents: number;
  private readonly events: TelemetryEvent[] = [];

  // Aggregates per event name.
  private readonly durationsByName = new Map<string, DurationAggregate>();
  private readonly numericByNameMetric = new Map<string, NumericAggregate>();

  constructor(args?: { maxEvents?: number }) {
    this.maxEvents = Math.max(100, Math.trunc(args?.maxEvents ?? 2000));
  }

  reset(): void {
    this.events.length = 0;
    this.durationsByName.clear();
    this.numericByNameMetric.clear();
  }

  record(event: Omit<TelemetryEvent, 'ts'> & { ts?: string }): void {
    const e: TelemetryEvent = { ts: event.ts ?? nowIso(), ...event };

    this.events.push(e);
    if (this.events.length > this.maxEvents)
      this.events.splice(0, this.events.length - this.maxEvents);

    const durationMs = safeNumber(e.durationMs);
    if (durationMs !== null) {
      const key = String(e.name);
      const agg = this.durationsByName.get(key) ?? {
        count: 0,
        sumMs: 0,
        maxMs: 0,
      };
      agg.count += 1;
      agg.sumMs += durationMs;
      if (durationMs > agg.maxMs) agg.maxMs = durationMs;
      this.durationsByName.set(key, agg);
    }

    const metrics = e.metrics ?? {};
    for (const metricName of Object.keys(metrics)) {
      const v = safeNumber(metrics[metricName]);
      if (v === null) continue;

      const k = `${String(e.name)}|${metricName}`;
      const agg = this.numericByNameMetric.get(k) ?? {
        count: 0,
        sum: 0,
        max: 0,
      };
      agg.count += 1;
      agg.sum += v;
      if (v > agg.max) agg.max = v;
      this.numericByNameMetric.set(k, agg);
    }
  }

  listRecent(limit = 200): readonly TelemetryEvent[] {
    const n = Math.max(0, Math.trunc(limit));
    if (n === 0) return [];
    return this.events.slice(Math.max(0, this.events.length - n));
  }

  snapshot(): {
    generatedAt: string;
    durationsByName: Array<{
      name: string;
      count: number;
      avgMs: number;
      maxMs: number;
    }>;
    metricsByName: Array<{
      name: string;
      metric: string;
      count: number;
      avg: number;
      max: number;
    }>;
    recentEvents: readonly TelemetryEvent[];
  } {
    const durationsByName = Array.from(this.durationsByName.entries())
      .map(([name, agg]) => ({
        name,
        count: agg.count,
        avgMs: agg.count > 0 ? agg.sumMs / agg.count : 0,
        maxMs: agg.maxMs,
      }))
      .sort((a, b) => compareStrings(a.name, b.name));

    const metricsByName = Array.from(this.numericByNameMetric.entries())
      .map(([k, agg]) => {
        const [name, metric] = k.split('|');
        return {
          name,
          metric,
          count: agg.count,
          avg: agg.count > 0 ? agg.sum / agg.count : 0,
          max: agg.max,
        };
      })
      .sort(
        (a, b) =>
          compareStrings(a.name, b.name) || compareStrings(a.metric, b.metric),
      );

    return {
      generatedAt: nowIso(),
      durationsByName,
      metricsByName,
      recentEvents: this.listRecent(200),
    };
  }
}

// Singleton for the running process.
export const telemetryStore = new TelemetryStore();
