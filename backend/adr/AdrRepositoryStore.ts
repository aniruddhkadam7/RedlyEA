import crypto from 'crypto';

import { projectStore } from '../project/ProjectStore';
import { AdrRepository } from './AdrRepository';
import type { ArchitectureDecisionRecordUpsertInput } from './ArchitectureDecisionRecord';

let repo: AdrRepository | null = null;

const notifyAdrsChanged = () => {
  try {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('ea:adrsChanged'));
  } catch {
    // Best-effort only.
  }
};

const makeAdrId = (): string => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyCrypto = crypto as any;
  if (typeof anyCrypto.randomUUID === 'function') return `adr_${anyCrypto.randomUUID()}`;
  return `adr_${crypto.createHash('sha1').update(`${Date.now()}-${Math.random()}`).digest('hex')}`;
};

/**
 * Singleton in-memory ADR repository bound to the active project.
 * - Resets on refresh/server restart.
 * - Scopes to current project id.
 */
export function getAdrRepository(): AdrRepository {
  const projectId = projectStore.getProject()?.id ?? '';
  if (!projectId) throw new Error('No active project. Create/select a project before managing ADRs.');

  if (!repo || repo.projectId !== projectId) {
    repo = new AdrRepository(projectId);
    notifyAdrsChanged();
  }

  return repo;
}

export function upsertAdr(input: ArchitectureDecisionRecordUpsertInput & { adrId?: string }) {
  const r = getAdrRepository();
  const adrId = (input.adrId ?? '').trim() || makeAdrId();
  const result = r.upsert({ ...input, adrId });
  if (result.ok) notifyAdrsChanged();
  return result;
}

export function deleteAdr(adrId: string) {
  const r = getAdrRepository();
  const ok = r.delete(adrId);
  if (ok) notifyAdrsChanged();
  return ok;
}
