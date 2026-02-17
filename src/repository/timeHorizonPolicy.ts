import type { TimeHorizon } from './repositoryMetadata';

export type TimeHorizonWindow = {
  /** Max traversal depth to use for analyses (impact, dependency, etc.). */
  maxAnalysisDepth: number;
  /** For roadmap-like windows: how many years forward to consider. */
  forwardYears: number;
};

export const getTimeHorizonWindow = (timeHorizon: TimeHorizon | null | undefined): TimeHorizonWindow => {
  switch (timeHorizon) {
    case 'Current':
      return { maxAnalysisDepth: 3, forwardYears: 0 };
    case '1–3 years':
      return { maxAnalysisDepth: 6, forwardYears: 3 };
    case 'Strategic':
      return { maxAnalysisDepth: 10, forwardYears: 10 };
    default:
      return { maxAnalysisDepth: 6, forwardYears: 3 };
  }
};

const parseDateMs = (value: string | undefined): number | null => {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
};

/**
 * Determines whether an item should be included in Roadmap output for the selected time horizon.
 *
 * - Current: show items overlapping "now".
 * - 1–3 years: show items overlapping [now, now+3y].
 * - Strategic: show items overlapping [now, now+10y].
 *
 * If dates are missing or invalid, we keep the item visible (conservative) unless it is explicitly ended in the past.
 */
export const isRoadmapItemInTimeHorizon = (args: {
  timeHorizon: TimeHorizon | null | undefined;
  nowMs: number;
  startDate?: string;
  endDate?: string;
  lifecycleStatus?: string;
}): boolean => {
  const { timeHorizon, nowMs, startDate, endDate } = args;
  const { forwardYears } = getTimeHorizonWindow(timeHorizon);

  const startMs = parseDateMs(startDate);
  const endMs = parseDateMs(endDate);

  // If explicitly ended in the past, drop it.
  if (endMs !== null && endMs < nowMs) return false;

  // "Current" is a strict window (overlap now).
  if (timeHorizon === 'Current') {
    // If we have at least one date, check overlap with now.
    if (startMs !== null || endMs !== null) {
      const startsOk = startMs === null || startMs <= nowMs;
      const endsOk = endMs === null || endMs >= nowMs;
      return startsOk && endsOk;
    }

    const ls = (args.lifecycleStatus ?? '').toLowerCase();
    if (ls.includes('active') || ls.includes('in progress') || ls.includes('inprogress')) return true;

    // Conservative: keep unknowns visible.
    return true;
  }

  const windowEndMs = (() => {
    const years = Math.max(0, forwardYears);
    const d = new Date(nowMs);
    d.setFullYear(d.getFullYear() + years);
    return d.getTime();
  })();

  // Overlap test with [now, windowEnd]
  const effectiveStart = startMs ?? nowMs;
  const effectiveEnd = endMs ?? windowEndMs;
  return effectiveStart <= windowEndMs && effectiveEnd >= nowMs;
};
