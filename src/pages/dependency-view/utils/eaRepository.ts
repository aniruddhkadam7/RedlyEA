import {
  isValidObjectType,
  isValidRelationshipType,
  type ObjectType,
  RELATIONSHIP_TYPE_DEFINITIONS,
  type RelationshipType,
} from './eaMetaModel';

export type EaObject = {
  id: string;
  type: ObjectType;
  workspaceId?: string;
  attributes: Record<string, unknown>;
};

export type EaRelationship = {
  /** Immutable relationship identity (UUID-ish). Optional for imports; assigned on insert. */
  id?: string;
  fromId: string;
  toId: string;
  type: RelationshipType;
  attributes?: Record<string, unknown>;
  sourceId?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
};

export type EaPersistedRelationship = Omit<EaRelationship, 'id'> & {
  id: string;
  attributes: Record<string, unknown>;
  sourceId: string;
  targetId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type EaRepositoryExport = {
  objects: EaObject[];
  relationships: EaPersistedRelationship[];
};

const makeRelationshipId = (): string => {
  try {
    if (typeof globalThis.crypto?.randomUUID === 'function')
      return globalThis.crypto.randomUUID();
  } catch {
    // ignore
  }
  return `rel-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const nowIso = () => new Date().toISOString();

const toRelationshipKey = (
  type: RelationshipType,
  fromId: string,
  toId: string,
) => `${type}::${fromId}::${toId}`;

export type EaRepositoryAddSuccess = { ok: true };
export type EaRepositoryAddFailure = { ok: false; error: string };
export type EaRepositoryAddResult =
  | EaRepositoryAddSuccess
  | EaRepositoryAddFailure;

export type EaRepositoryValidateSuccess = { ok: true };
export type EaRepositoryValidateFailure = { ok: false; error: string };
export type EaRepositoryValidateResult =
  | EaRepositoryValidateSuccess
  | EaRepositoryValidateFailure;

export class EaRepository {
  objects: Map<string, EaObject>;

  private _relationships: EaPersistedRelationship[];

  private _relationshipsView: EaPersistedRelationship[];

  private relationshipsById: Map<string, EaPersistedRelationship>;

  private relationshipIdsByType: Map<RelationshipType, Set<string>>;

  private relationshipIdsBySource: Map<string, Set<string>>;

  private relationshipIdsByTarget: Map<string, Set<string>>;

  private relationshipIdByKey: Map<string, string>;

  private relationshipIntegrityErrors: string[];

  get relationships(): EaPersistedRelationship[] {
    return this._relationshipsView;
  }

  set relationships(value: EaRelationship[]) {
    const incoming = Array.isArray(value) ? value : [];
    this._relationships = incoming.map((rel) => ({ ...(rel as any) }));
    this._relationshipsView = this.wrapRelationshipsArray(this._relationships);
    this.rebuildRelationshipIndexes();
  }

  constructor(opts?: {
    objects?: Iterable<EaObject>;
    relationships?: Iterable<EaRelationship>;
  }) {
    this.objects = new Map();
    this._relationships = [];
    this._relationshipsView = this.wrapRelationshipsArray(this._relationships);
    this.relationshipsById = new Map();
    this.relationshipIdsByType = new Map();
    this.relationshipIdsBySource = new Map();
    this.relationshipIdsByTarget = new Map();
    this.relationshipIdByKey = new Map();
    this.relationshipIntegrityErrors = [];

    if (opts?.objects) {
      for (const obj of opts.objects) {
        // Best-effort load; ignore invalid items.
        const res = this.addObject(obj);
        if (!res.ok) continue;
      }
    }

    if (opts?.relationships) {
      for (const rel of opts.relationships) {
        const res = this.addRelationship(rel);
        if (!res.ok) continue;
      }
    }
  }

  clone(): EaRepository {
    const imported = EaRepository.import(this.export());
    if (!imported.ok) return new EaRepository();
    return imported.repo;
  }

  export(): EaRepositoryExport {
    return {
      objects: Array.from(this.objects.values()).map((obj) => ({
        id: obj.id,
        type: obj.type,
        workspaceId: obj.workspaceId,
        attributes: { ...(obj.attributes ?? {}) },
      })),
      relationships: this.relationships.map((rel) => ({
        id: rel.id,
        fromId: rel.fromId,
        toId: rel.toId,
        sourceId: rel.sourceId,
        targetId: rel.targetId,
        type: rel.type,
        attributes: { ...(rel.attributes ?? {}) },
        metadata: { ...(rel.metadata ?? {}) },
        createdAt: rel.createdAt,
        updatedAt: rel.updatedAt,
      })),
    };
  }

  static import(input: {
    objects?: Iterable<EaObject>;
    relationships?: Iterable<EaRelationship>;
  }):
    | { ok: true; repo: EaRepository }
    | { ok: false; error: string; errors: string[] } {
    const next = new EaRepository();
    const errors: string[] = [];

    for (const obj of input.objects ?? []) {
      const res = next.addObject(obj);
      if (!res.ok) errors.push(res.error);
    }

    for (const rel of input.relationships ?? []) {
      const res = next.addRelationship(rel);
      if (!res.ok) errors.push(res.error);
    }

    if (errors.length > 0) {
      return {
        ok: false,
        error: errors[0] ?? 'Invalid repository import payload.',
        errors,
      };
    }

    return { ok: true, repo: next };
  }

  private wrapRelationshipsArray(
    storage: EaPersistedRelationship[],
  ): EaPersistedRelationship[] {
    const mutatingMethods = new Set([
      'copyWithin',
      'fill',
      'pop',
      'push',
      'reverse',
      'shift',
      'sort',
      'splice',
      'unshift',
    ]);

    return new Proxy(storage, {
      get: (target, property, receiver) => {
        const value = Reflect.get(target, property, receiver);
        if (
          typeof value === 'function' &&
          mutatingMethods.has(String(property))
        ) {
          return (...args: unknown[]) => {
            const result = value.apply(target, args);
            this.rebuildRelationshipIndexes();
            return result;
          };
        }
        return value;
      },
      set: (target, property, value, receiver) => {
        const result = Reflect.set(target, property, value, receiver);
        this.rebuildRelationshipIndexes();
        return result;
      },
      deleteProperty: (target, property) => {
        const result = Reflect.deleteProperty(target, property);
        this.rebuildRelationshipIndexes();
        return result;
      },
    });
  }

  private normalizeRelationshipRecord(input: EaRelationship):
    | {
        ok: true;
        relationship: EaPersistedRelationship;
      }
    | {
        ok: false;
        error: string;
      } {
    const fromId = String(input?.fromId ?? input?.sourceId ?? '').trim();
    const toId = String(input?.toId ?? input?.targetId ?? '').trim();
    const relationshipId =
      String(input?.id ?? '').trim() || makeRelationshipId();

    if (!relationshipId) {
      return { ok: false, error: 'Relationship id is required.' };
    }
    if (!fromId) {
      return { ok: false, error: 'Relationship fromId is required.' };
    }
    if (!toId) {
      return { ok: false, error: 'Relationship toId is required.' };
    }

    if (!isValidRelationshipType(input?.type)) {
      return {
        ok: false,
        error: `Invalid relationship type "${String(input?.type)}".`,
      };
    }

    const type = input.type;

    const sourceRef = this.validateReference(fromId);
    if (!sourceRef.ok) return sourceRef;

    const targetRef = this.validateReference(toId);
    if (!targetRef.ok) return targetRef;

    const relationshipTypeDef = RELATIONSHIP_TYPE_DEFINITIONS[type];
    if (!relationshipTypeDef) {
      return {
        ok: false,
        error: `Invalid relationship type "${String(type)}" (no definition).`,
      };
    }

    const fromObj = this.objects.get(fromId);
    const toObj = this.objects.get(toId);
    if (!fromObj) return { ok: false, error: `Unknown object id "${fromId}".` };
    if (!toObj) return { ok: false, error: `Unknown object id "${toId}".` };

    const fromType: ObjectType = fromObj.type;
    const toType: ObjectType = toObj.type;

    const pairs = (relationshipTypeDef as any)?.allowedEndpointPairs as
      | ReadonlyArray<{ from: ObjectType; to: ObjectType }>
      | undefined;

    if (Array.isArray(pairs) && pairs.length > 0) {
      const ok = pairs.some((p) => p.from === fromType && p.to === toType);
      if (!ok) {
        return {
          ok: false,
          error: `Invalid endpoints for relationship type "${type}" ("${fromType}" -> "${toType}").`,
        };
      }
    } else if (
      !relationshipTypeDef.fromTypes.includes(fromType) ||
      !relationshipTypeDef.toTypes.includes(toType)
    ) {
      return {
        ok: false,
        error: `Invalid endpoints for relationship type "${type}" ("${fromType}" -> "${toType}").`,
      };
    }

    const attributes = { ...(input?.attributes ?? {}) };
    const metadata = {
      ...(input?.metadata ?? {}),
      ...(attributes ?? {}),
    };

    const createdAt =
      typeof input?.createdAt === 'string' && input.createdAt.trim()
        ? input.createdAt
        : typeof (metadata as any)?.createdAt === 'string' &&
            String((metadata as any).createdAt).trim()
          ? String((metadata as any).createdAt)
          : nowIso();

    const updatedAt =
      typeof input?.updatedAt === 'string' && input.updatedAt.trim()
        ? input.updatedAt
        : typeof (metadata as any)?.updatedAt === 'string' &&
            String((metadata as any).updatedAt).trim()
          ? String((metadata as any).updatedAt)
          : typeof (metadata as any)?.lastModifiedAt === 'string' &&
              String((metadata as any).lastModifiedAt).trim()
            ? String((metadata as any).lastModifiedAt)
            : createdAt;

    const persisted: EaPersistedRelationship = {
      id: relationshipId,
      fromId,
      toId,
      sourceId: fromId,
      targetId: toId,
      type,
      attributes: {
        ...attributes,
        createdAt,
        updatedAt,
        lastModifiedAt: updatedAt,
      },
      metadata: {
        ...metadata,
        createdAt,
        updatedAt,
      },
      createdAt,
      updatedAt,
    };

    return { ok: true, relationship: persisted };
  }

  private indexRelationship(rel: EaPersistedRelationship): void {
    this.relationshipsById.set(rel.id, rel);

    const typeSet =
      this.relationshipIdsByType.get(rel.type) ?? new Set<string>();
    typeSet.add(rel.id);
    this.relationshipIdsByType.set(rel.type, typeSet);

    const sourceSet =
      this.relationshipIdsBySource.get(rel.fromId) ?? new Set<string>();
    sourceSet.add(rel.id);
    this.relationshipIdsBySource.set(rel.fromId, sourceSet);

    const targetSet =
      this.relationshipIdsByTarget.get(rel.toId) ?? new Set<string>();
    targetSet.add(rel.id);
    this.relationshipIdsByTarget.set(rel.toId, targetSet);

    this.relationshipIdByKey.set(
      toRelationshipKey(rel.type, rel.fromId, rel.toId),
      rel.id,
    );
  }

  private unindexRelationship(rel: EaPersistedRelationship): void {
    this.relationshipsById.delete(rel.id);

    const typeSet = this.relationshipIdsByType.get(rel.type);
    if (typeSet) {
      typeSet.delete(rel.id);
      if (typeSet.size === 0) this.relationshipIdsByType.delete(rel.type);
    }

    const sourceSet = this.relationshipIdsBySource.get(rel.fromId);
    if (sourceSet) {
      sourceSet.delete(rel.id);
      if (sourceSet.size === 0) this.relationshipIdsBySource.delete(rel.fromId);
    }

    const targetSet = this.relationshipIdsByTarget.get(rel.toId);
    if (targetSet) {
      targetSet.delete(rel.id);
      if (targetSet.size === 0) this.relationshipIdsByTarget.delete(rel.toId);
    }

    this.relationshipIdByKey.delete(
      toRelationshipKey(rel.type, rel.fromId, rel.toId),
    );
  }

  private rebuildRelationshipIndexes(): void {
    this.relationshipsById.clear();
    this.relationshipIdsByType.clear();
    this.relationshipIdsBySource.clear();
    this.relationshipIdsByTarget.clear();
    this.relationshipIdByKey.clear();

    const next: EaPersistedRelationship[] = [];
    const errors: string[] = [];

    for (const rel of this._relationships) {
      const normalized = this.normalizeRelationshipRecord(rel);
      if (!normalized.ok) {
        errors.push(normalized.error);
        continue;
      }

      const duplicateId = this.relationshipsById.has(
        normalized.relationship.id,
      );
      if (duplicateId) {
        errors.push(
          `Duplicate relationship id "${normalized.relationship.id}".`,
        );
        continue;
      }

      const tripletKey = toRelationshipKey(
        normalized.relationship.type,
        normalized.relationship.fromId,
        normalized.relationship.toId,
      );
      if (this.relationshipIdByKey.has(tripletKey)) {
        errors.push(
          `Duplicate relationship tuple "${normalized.relationship.type}:${normalized.relationship.fromId}->${normalized.relationship.toId}".`,
        );
        continue;
      }

      next.push(normalized.relationship);
      this.indexRelationship(normalized.relationship);
    }

    this.relationshipIntegrityErrors = errors;

    this._relationships.splice(0, this._relationships.length, ...next);
  }

  private addRelationshipInternal(
    rel: EaRelationship,
    options?: { bypassEndpointValidation?: boolean },
  ): EaRepositoryAddResult {
    const normalized = this.normalizeRelationshipRecord(rel);
    if (!normalized.ok) return normalized;

    const relationship = normalized.relationship;

    if (options?.bypassEndpointValidation === true) {
      // Endpoint validation is already inside normalizeRelationshipRecord.
      // For unchecked mode we only bypass endpoint *type* checks.
      // Rebuild without endpoint constraints:
      const fromRef = this.validateReference(relationship.fromId);
      if (!fromRef.ok) return fromRef;
      const toRef = this.validateReference(relationship.toId);
      if (!toRef.ok) return toRef;
    }

    if (this.relationshipsById.has(relationship.id)) {
      return {
        ok: false,
        error: `Duplicate relationship id "${relationship.id}".`,
      };
    }

    const key = toRelationshipKey(
      relationship.type,
      relationship.fromId,
      relationship.toId,
    );
    if (this.relationshipIdByKey.has(key)) {
      return {
        ok: false,
        error: `Duplicate relationship "${relationship.type}:${relationship.fromId}->${relationship.toId}" is not allowed.`,
      };
    }

    this._relationships.push(relationship);
    this.indexRelationship(relationship);
    this.relationshipIntegrityErrors = [];
    return { ok: true };
  }

  // Contract: addObject inserts exactly one element; it must never auto-create other elements.
  addObject(object: {
    id: string;
    type: unknown;
    attributes?: Record<string, unknown>;
    workspaceId?: string;
  }): EaRepositoryAddResult {
    const id = (object.id ?? '').trim();
    if (!id) return { ok: false, error: 'Object id is required.' };

    if (!isValidObjectType(object.type)) {
      return {
        ok: false,
        error: `Invalid object type "${String(object.type)}".`,
      };
    }

    if (this.objects.has(id)) {
      return { ok: false, error: `Duplicate object id "${id}".` };
    }

    this.objects.set(id, {
      id,
      type: object.type,
      workspaceId: object.workspaceId,
      attributes: object.attributes ?? {},
    });

    return { ok: true };
  }

  addRelationship(rel: {
    id?: string;
    fromId: string;
    toId: string;
    type: unknown;
    attributes?: Record<string, unknown>;
    sourceId?: string;
    targetId?: string;
    metadata?: Record<string, unknown>;
    createdAt?: string;
    updatedAt?: string;
  }): EaRepositoryAddResult {
    return this.addRelationshipInternal(rel);
  }

  /**
   * Advisory-mode helper: inserts a relationship without enforcing endpoint type rules.
   *
   * Still enforces:
   * - non-empty fromId/toId
   * - known relationship type
   * - non-dangling references
   */
  addRelationshipUnchecked(rel: {
    id?: string;
    fromId: string;
    toId: string;
    type: unknown;
    attributes?: Record<string, unknown>;
    sourceId?: string;
    targetId?: string;
    metadata?: Record<string, unknown>;
    createdAt?: string;
    updatedAt?: string;
  }): EaRepositoryAddResult {
    // For compatibility, unchecked mode allows skipping endpoint-type validation
    // but still enforces IDs, type validity, references, and duplicate prevention.
    const fromId = (rel.fromId ?? rel.sourceId ?? '').trim();
    const toId = (rel.toId ?? rel.targetId ?? '').trim();

    if (!fromId)
      return { ok: false, error: 'Relationship fromId is required.' };
    if (!toId) return { ok: false, error: 'Relationship toId is required.' };

    if (!isValidRelationshipType(rel.type)) {
      return {
        ok: false,
        error: `Invalid relationship type "${String(rel.type)}".`,
      };
    }

    const fromRef = this.validateReference(fromId);
    if (!fromRef.ok) return fromRef;

    const toRef = this.validateReference(toId);
    if (!toRef.ok) return toRef;

    const relationshipId = (rel.id ?? '').trim() || makeRelationshipId();
    if (this.relationshipsById.has(relationshipId)) {
      return {
        ok: false,
        error: `Duplicate relationship id "${relationshipId}".`,
      };
    }

    const relationshipType = rel.type;
    const duplicateKey = toRelationshipKey(relationshipType, fromId, toId);
    if (this.relationshipIdByKey.has(duplicateKey)) {
      return {
        ok: false,
        error: `Duplicate relationship "${relationshipType}:${fromId}->${toId}" is not allowed.`,
      };
    }

    const metadata = { ...(rel.metadata ?? {}), ...(rel.attributes ?? {}) };
    const createdAt =
      typeof rel.createdAt === 'string' && rel.createdAt.trim()
        ? rel.createdAt
        : nowIso();
    const updatedAt =
      typeof rel.updatedAt === 'string' && rel.updatedAt.trim()
        ? rel.updatedAt
        : createdAt;

    const persisted: EaPersistedRelationship = {
      id: relationshipId,
      fromId,
      toId,
      sourceId: fromId,
      targetId: toId,
      type: relationshipType,
      attributes: {
        ...(rel.attributes ?? {}),
        createdAt,
        updatedAt,
        lastModifiedAt: updatedAt,
      },
      metadata: {
        ...metadata,
        createdAt,
        updatedAt,
      },
      createdAt,
      updatedAt,
    };

    this._relationships.push(persisted);
    this.indexRelationship(persisted);
    this.relationshipIntegrityErrors = [];

    return { ok: true };
  }

  getObjectsByType(type: unknown): EaObject[] {
    if (!isValidObjectType(type)) return [];

    const results: EaObject[] = [];
    for (const obj of this.objects.values()) {
      if (obj.type === type) results.push(obj);
    }
    return results;
  }

  getRelationshipsByType(type: unknown): EaRelationship[] {
    if (!isValidRelationshipType(type)) return [];
    const ids = this.relationshipIdsByType.get(type) ?? new Set<string>();
    const items: EaPersistedRelationship[] = [];
    for (const id of ids) {
      const rel = this.relationshipsById.get(id);
      if (rel) items.push(rel);
    }
    return items;
  }

  getRelationshipById(relationshipId: string): EaPersistedRelationship | null {
    const key = (relationshipId ?? '').trim();
    if (!key) return null;
    return this.relationshipsById.get(key) ?? null;
  }

  getRelationshipsBySourceId(sourceId: string): EaPersistedRelationship[] {
    const key = (sourceId ?? '').trim();
    if (!key) return [];
    const ids = this.relationshipIdsBySource.get(key) ?? new Set<string>();
    const items: EaPersistedRelationship[] = [];
    for (const id of ids) {
      const rel = this.relationshipsById.get(id);
      if (rel) items.push(rel);
    }
    return items;
  }

  getRelationshipsByTargetId(targetId: string): EaPersistedRelationship[] {
    const key = (targetId ?? '').trim();
    if (!key) return [];
    const ids = this.relationshipIdsByTarget.get(key) ?? new Set<string>();
    const items: EaPersistedRelationship[] = [];
    for (const id of ids) {
      const rel = this.relationshipsById.get(id);
      if (rel) items.push(rel);
    }
    return items;
  }

  removeRelationshipById(relationshipId: string): EaRepositoryAddResult {
    const key = (relationshipId ?? '').trim();
    if (!key) return { ok: false, error: 'Relationship id is required.' };

    const existing = this.relationshipsById.get(key);
    if (!existing) {
      return { ok: false, error: `Unknown relationship id "${key}".` };
    }

    const index = this._relationships.findIndex((r) => r.id === key);
    if (index >= 0) this._relationships.splice(index, 1);
    this.unindexRelationship(existing);
    this.relationshipIntegrityErrors = [];
    return { ok: true };
  }

  updateRelationship(
    relationshipId: string,
    patch: Partial<{
      type: RelationshipType;
      fromId: string;
      toId: string;
      attributes: Record<string, unknown>;
      metadata: Record<string, unknown>;
      updatedAt: string;
    }>,
  ): EaRepositoryAddResult {
    const key = (relationshipId ?? '').trim();
    if (!key) return { ok: false, error: 'Relationship id is required.' };

    const existing = this.relationshipsById.get(key);
    if (!existing) {
      return { ok: false, error: `Unknown relationship id "${key}".` };
    }

    const candidate: EaRelationship = {
      id: existing.id,
      fromId: patch.fromId ?? existing.fromId,
      toId: patch.toId ?? existing.toId,
      sourceId: patch.fromId ?? existing.fromId,
      targetId: patch.toId ?? existing.toId,
      type: patch.type ?? existing.type,
      attributes: {
        ...existing.attributes,
        ...(patch.attributes ?? {}),
      },
      metadata: {
        ...existing.metadata,
        ...(patch.metadata ?? {}),
      },
      createdAt: existing.createdAt,
      updatedAt: patch.updatedAt ?? nowIso(),
    };

    const normalized = this.normalizeRelationshipRecord(candidate);
    if (!normalized.ok) return normalized;

    const updated = normalized.relationship;
    const nextKey = toRelationshipKey(
      updated.type,
      updated.fromId,
      updated.toId,
    );
    const existingIdForKey = this.relationshipIdByKey.get(nextKey);
    if (existingIdForKey && existingIdForKey !== key) {
      return {
        ok: false,
        error: `Duplicate relationship "${updated.type}:${updated.fromId}->${updated.toId}" is not allowed.`,
      };
    }

    const index = this._relationships.findIndex((rel) => rel.id === key);
    if (index < 0) {
      return { ok: false, error: `Unknown relationship id "${key}".` };
    }

    this.unindexRelationship(existing);
    this._relationships[index] = updated;
    this.indexRelationship(updated);
    this.relationshipIntegrityErrors = [];
    return { ok: true };
  }

  validateRelationshipIntegrity(): EaRepositoryValidateResult {
    this.rebuildRelationshipIndexes();
    if (this.relationshipIntegrityErrors.length > 0) {
      return { ok: false, error: this.relationshipIntegrityErrors[0]! };
    }
    return { ok: true };
  }

  getRelationshipIntegrityErrors(): string[] {
    this.rebuildRelationshipIndexes();
    return [...this.relationshipIntegrityErrors];
  }

  validateReference(id: string): EaRepositoryValidateResult {
    const key = (id ?? '').trim();
    if (!key) return { ok: false, error: 'Reference id is required.' };

    if (!this.objects.has(key)) {
      return { ok: false, error: `Unknown object id "${key}".` };
    }

    return { ok: true };
  }

  updateObjectAttributes(
    id: string,
    patch: Record<string, unknown>,
    mode: 'merge' | 'replace' = 'merge',
  ): EaRepositoryAddResult {
    const key = (id ?? '').trim();
    if (!key) return { ok: false, error: 'Object id is required.' };

    const existing = this.objects.get(key);
    if (!existing) return { ok: false, error: `Unknown object id "${key}".` };

    const nextAttributes =
      mode === 'replace'
        ? { ...(patch ?? {}) }
        : { ...existing.attributes, ...(patch ?? {}) };
    this.objects.set(key, { ...existing, attributes: nextAttributes });
    return { ok: true };
  }
}
