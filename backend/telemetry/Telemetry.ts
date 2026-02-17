import { telemetryStore, type TelemetryEvent } from './TelemetryStore';

const envFlag = (name: string): string => {
  try {
    const p = (globalThis as unknown as { process?: { env?: Record<string, unknown> } }).process;
    return String(p?.env?.[name] ?? '').trim();
  } catch {
    return '';
  }
};

const isEnabled = (): boolean => {
  const v = envFlag('EA_TELEMETRY');
  if (!v) return true;
  return v === '1' || v.toLowerCase() === 'true' || v.toLowerCase() === 'yes';
};

const isStructuredLogsEnabled = (): boolean => {
  const v = envFlag('EA_TELEMETRY_LOGS');
  if (!v) return true;
  return v === '1' || v.toLowerCase() === 'true' || v.toLowerCase() === 'yes';
};

const nowMs = (): number => {
  // Prefer high-res timer when available.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const perf = (globalThis as any)?.performance;
  if (perf && typeof perf.now === 'function') return perf.now();
  return Date.now();
};

export const telemetry = {
  nowMs,

  record(event: Omit<TelemetryEvent, 'ts'> & { ts?: string }) {
    if (!isEnabled()) return;

    telemetryStore.record(event);

    if (isStructuredLogsEnabled()) {
      const line = {
        ts: event.ts,
        name: event.name,
        durationMs: event.durationMs,
        tags: event.tags,
        metrics: event.metrics,
        message: event.message,
      };

      // Structured, one-line JSON logs (operator-friendly).
      try {
        // eslint-disable-next-line no-console
        console.info(JSON.stringify({ type: 'ea.telemetry', ...line }));
      } catch {
        // ignore
      }
    }
  },
};
