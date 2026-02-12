import { EaRepository, type EaObject, type EaRelationship } from './eaRepository';

export type EaImportApplySuccess = { ok: true; nextRepository: EaRepository };
export type EaImportApplyFailure = { ok: false; errors: string[] };
export type EaImportApplyResult = EaImportApplySuccess | EaImportApplyFailure;

export function applyEaImportBatch(
  current: EaRepository,
  batch: {
    objects?: ReadonlyArray<EaObject>;
    relationships?: ReadonlyArray<EaRelationship>;
  },
): EaImportApplyResult {
  const draft = current.clone();
  const errors: string[] = [];

  for (const obj of batch.objects ?? []) {
    const res = draft.addObject(obj);
    if (!res.ok) errors.push(res.error);
  }

  for (const rel of batch.relationships ?? []) {
    const res = draft.addRelationship(rel);
    if (!res.ok) errors.push(res.error);
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, nextRepository: draft };
}
