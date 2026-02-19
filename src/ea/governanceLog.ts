export type GovernanceLogEventType =
  | 'save.warned'
  | 'save.blocked'
  | 'export.warned'
  | 'export.blocked'
  | 'import.warned'
  | 'import.blocked';

export type GovernanceLogEntry = {
  id: string;
  occurredAt: string;
  type: GovernanceLogEventType;

  governanceMode: 'Strict' | 'Advisory' | 'Unknown';
  repositoryName?: string;
  architectureScope?: string;

  summary: {
    mandatoryFindingCount: number;
    relationshipErrorCount: number;
    relationshipWarningCount: number;
    invalidRelationshipInsertCount: number;
    total: number;
  };

  highlights: string[];
};

const STORAGE_KEY = 'ea.governance.log.v1';
const MAX_ENTRIES = 200;

const nowIso = () => new Date().toISOString();

const safeParse = (raw: string | null): GovernanceLogEntry[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(Boolean) as GovernanceLogEntry[];
  } catch {
    return [];
  }
};

const makeId = () => `${nowIso()}:${Math.random().toString(16).slice(2)}`;

export function readGovernanceLog(): GovernanceLogEntry[] {
  try {
    return safeParse(localStorage.getItem(STORAGE_KEY));
  } catch {
    return [];
  }
}

export function clearGovernanceLog(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function appendGovernanceLog(
  entry: Omit<GovernanceLogEntry, 'id' | 'occurredAt'>,
): void {
  try {
    const current = readGovernanceLog();
    const next: GovernanceLogEntry = {
      id: makeId(),
      occurredAt: nowIso(),
      ...entry,
    };

    // De-dupe: if the last entry has same type + same total counts, drop.
    const last = current[0];
    if (
      last &&
      last.type === next.type &&
      last.governanceMode === next.governanceMode &&
      last.repositoryName === next.repositoryName &&
      last.architectureScope === next.architectureScope &&
      last.summary.total === next.summary.total &&
      last.summary.mandatoryFindingCount ===
        next.summary.mandatoryFindingCount &&
      last.summary.relationshipErrorCount ===
        next.summary.relationshipErrorCount &&
      last.summary.invalidRelationshipInsertCount ===
        next.summary.invalidRelationshipInsertCount
    ) {
      return;
    }

    const updated = [next, ...current].slice(0, MAX_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
}
