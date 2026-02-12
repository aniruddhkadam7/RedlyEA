import type {
  AdrStatus,
  ArchitectureDecisionRecord,
  ArchitectureDecisionRecordUpsertInput,
} from './ArchitectureDecisionRecord';

export type AdrUpsertResult =
  | { ok: true; created: boolean; adr: ArchitectureDecisionRecord }
  | { ok: false; error: string };

const normalizeId = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const normalizeText = (value: unknown) => (typeof value === 'string' ? value : String(value ?? '')).trim();

const normalizeList = (values: unknown): string[] => {
  const list = Array.isArray(values) ? values : [];
  const set = new Set<string>();
  for (const v of list) {
    const s = normalizeId(v);
    if (s) set.add(s);
  }
  return Array.from(set).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
};

const isAdrStatus = (value: unknown): value is AdrStatus =>
  value === 'Proposed' || value === 'Accepted' || value === 'Superseded';

const normalizeStatus = (value: unknown): AdrStatus => (isAdrStatus(value) ? value : 'Proposed');

const normalizeDecisionDate = (value: unknown): string => {
  const raw = normalizeText(value);
  if (!raw) return '';
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? raw : new Date(ms).toISOString();
};

/**
 * In-memory ADR repository.
 *
 * Notes:
 * - No persistence.
 * - No format enforcement (free-text fields).
 * - Deterministic: lists are normalized and sorted.
 */
export class AdrRepository {
  readonly projectId: string;

  private readonly byId = new Map<string, ArchitectureDecisionRecord>();

  constructor(projectId: string) {
    this.projectId = normalizeId(projectId);
    if (!this.projectId) throw new Error('AdrRepository requires a projectId.');
  }

  listAll(): ArchitectureDecisionRecord[] {
    const list = Array.from(this.byId.values());
    list.sort((a, b) =>
      a.status.localeCompare(b.status) ||
      a.title.localeCompare(b.title) ||
      a.decisionDate.localeCompare(b.decisionDate) ||
      a.adrId.localeCompare(b.adrId),
    );
    return list;
  }

  getById(adrId: string): ArchitectureDecisionRecord | null {
    const id = normalizeId(adrId);
    if (!id) return null;
    return this.byId.get(id) ?? null;
  }

  upsert(input: ArchitectureDecisionRecordUpsertInput & { adrId: string }): AdrUpsertResult {
    const adrId = normalizeId(input.adrId);
    if (!adrId) return { ok: false, error: 'adrId is required.' };

    const existing = this.byId.get(adrId) ?? null;

    const next: ArchitectureDecisionRecord = {
      adrId,
      title: normalizeText(input.title ?? existing?.title ?? ''),
      context: normalizeText(input.context ?? existing?.context ?? ''),
      decision: normalizeText(input.decision ?? existing?.decision ?? ''),
      consequences: normalizeText(input.consequences ?? existing?.consequences ?? ''),
      relatedElements: normalizeList((input as any).relatedElements ?? existing?.relatedElements ?? []),
      relatedViews: normalizeList((input as any).relatedViews ?? existing?.relatedViews ?? []),
      status: normalizeStatus(input.status ?? existing?.status ?? 'Proposed'),
      decisionDate: normalizeDecisionDate(input.decisionDate ?? existing?.decisionDate ?? ''),
    };

    this.byId.set(adrId, next);
    return { ok: true, created: existing === null, adr: next };
  }

  delete(adrId: string): boolean {
    const id = normalizeId(adrId);
    if (!id) return false;
    return this.byId.delete(id);
  }
}
