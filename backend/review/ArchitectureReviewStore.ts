import type {
  ArchitectureReviewRecord,
  ArchitectureReviewState,
  ArchitectureReviewUpsertInput,
  ReviewSubjectKind,
} from './ArchitectureReview';

const normalizeId = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const isAllowedKind = (k: string): k is ReviewSubjectKind => k === 'View' || k === 'ImpactAnalysis';

const isAllowedState = (s: string): s is ArchitectureReviewState =>
  s === 'Not Reviewed' || s === 'Reviewed' || s === 'Review Findings Accepted';

const makeKey = (kind: ReviewSubjectKind, id: string) => `${kind}:${id}`;

const notifyReviewsChanged = () => {
  try {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('ea:reviewsChanged'));
  } catch {
    // Best-effort only.
  }
};

export class ArchitectureReviewStore {
  private readonly byKey = new Map<string, ArchitectureReviewRecord>();

  get(subjectKind: ReviewSubjectKind, subjectId: string): ArchitectureReviewRecord | null {
    const id = normalizeId(subjectId);
    if (!id) return null;
    return this.byKey.get(makeKey(subjectKind, id)) ?? null;
  }

  upsert(args: {
    subjectKind: ReviewSubjectKind;
    subjectId: string;
    input: ArchitectureReviewUpsertInput;
    now?: Date;
  }): ArchitectureReviewRecord | null {
    const subjectId = normalizeId(args.subjectId);
    if (!subjectId) return null;

    const now = args.now ?? new Date();
    const state = args.input.state;

    if (!isAllowedState(state)) return null;

    // Not Reviewed means no stored record.
    if (state === 'Not Reviewed') {
      this.byKey.delete(makeKey(args.subjectKind, subjectId));
      notifyReviewsChanged();
      return null;
    }

    const reviewer = normalizeId(args.input.reviewer) || 'unknown';
    const reviewNotes = typeof args.input.reviewNotes === 'string' ? args.input.reviewNotes : '';

    const reviewDate = (() => {
      const raw = normalizeId(args.input.reviewDate);
      if (!raw) return now.toISOString();
      const ms = Date.parse(raw);
      return Number.isNaN(ms) ? now.toISOString() : new Date(ms).toISOString();
    })();

    const record: ArchitectureReviewRecord = {
      subjectKind: args.subjectKind,
      subjectId,
      state,
      reviewer,
      reviewDate,
      reviewNotes,
    };

    this.byKey.set(makeKey(args.subjectKind, subjectId), record);
    notifyReviewsChanged();
    return record;
  }

  clearAll(): void {
    this.byKey.clear();
    notifyReviewsChanged();
  }

  static parseKind(value: unknown): ReviewSubjectKind | null {
    const k = normalizeId(value);
    return isAllowedKind(k) ? k : null;
  }
}

let store: ArchitectureReviewStore | null = null;

/** Singleton in-memory review store (resets on refresh). */
export function getArchitectureReviewStore(): ArchitectureReviewStore {
  if (!store) store = new ArchitectureReviewStore();
  return store;
}
