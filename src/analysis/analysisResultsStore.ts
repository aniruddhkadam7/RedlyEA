export type AnalysisKind = 'impact' | 'dependency' | 'coverage';

export type AnalysisResultRecord<TData = unknown> = {
  id: string;
  kind: AnalysisKind;
  title: string;
  createdAt: string;
  data: TData;
};

const MAX_RESULTS = 50;

const makeId = (): string => {
  // UI-only in-memory id; deterministic uniqueness is not required.
  // Use timestamp + random to avoid collisions across rapid runs.
  return `res_${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

const store: {
  order: string[];
  byId: Map<string, AnalysisResultRecord<any>>;
} = {
  order: [],
  byId: new Map(),
};

export function createAnalysisResult<TData>(args: {
  kind: AnalysisKind;
  title: string;
  data: TData;
  createdAt?: string;
}): AnalysisResultRecord<TData> {
  const record: AnalysisResultRecord<TData> = {
    id: makeId(),
    kind: args.kind,
    title: args.title,
    createdAt: args.createdAt ?? new Date().toISOString(),
    data: args.data,
  };

  store.byId.set(record.id, record);
  store.order.unshift(record.id);

  // Evict oldest.
  while (store.order.length > MAX_RESULTS) {
    const evictedId = store.order.pop();
    if (evictedId) store.byId.delete(evictedId);
  }

  return record;
}

export function getAnalysisResult<TData = unknown>(
  id: string,
): AnalysisResultRecord<TData> | undefined {
  return store.byId.get(id) as AnalysisResultRecord<TData> | undefined;
}

export function listAnalysisResults(
  kind?: AnalysisKind,
): AnalysisResultRecord[] {
  const results: AnalysisResultRecord[] = [];
  for (const id of store.order) {
    const rec = store.byId.get(id);
    if (!rec) continue;
    if (kind && rec.kind !== kind) continue;
    results.push(rec);
  }
  return results;
}

export function clearAnalysisResults(): number {
  const count = store.order.length;
  store.order = [];
  store.byId.clear();
  return count;
}
