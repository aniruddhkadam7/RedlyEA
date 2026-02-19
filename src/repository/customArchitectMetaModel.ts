/**
 * Custom Architect Meta-Model Store
 *
 * For CUSTOM (Architect Mode) repositories, this module provides persistent
 * storage and management of user-defined element types and relationship types.
 *
 * These are stored in localStorage keyed by repository name.
 * They work alongside (not replacing) the built-in OBJECT_TYPE_DEFINITIONS.
 */

export type CustomPropertyType =
  | 'string'
  | 'number'
  | 'date'
  | 'enum'
  | 'boolean';

export type CustomPropertyDefinition = {
  id: string;
  name: string;
  type: CustomPropertyType;
  /** For enum type: allowed values */
  enumValues?: string[];
  required?: boolean;
  description?: string;
};

export type CustomElementType = {
  id: string;
  name: string;
  color: string;
  icon: string;
  description: string;
  properties: CustomPropertyDefinition[];
  createdAt: string;
  updatedAt: string;
};

export type CustomRelationshipType = {
  id: string;
  name: string;
  sourceElementTypeId: string;
  targetElementTypeId: string;
  arrowDirection: 'forward' | 'backward' | 'both' | 'none';
  lineStyle: 'solid' | 'dashed' | 'dotted';
  color: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
};

export type CustomArchitectMetaModel = {
  elementTypes: CustomElementType[];
  relationshipTypes: CustomRelationshipType[];
};

const STORAGE_PREFIX = 'ea.custom-metamodel.';

const getStorageKey = (repositoryName: string): string =>
  `${STORAGE_PREFIX}${repositoryName}`;

const makeId = (): string => {
  try {
    if (typeof globalThis.crypto?.randomUUID === 'function')
      return globalThis.crypto.randomUUID();
  } catch {
    // ignore
  }
  return `ctype-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const nowIso = () => new Date().toISOString();

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export function loadCustomMetaModel(
  repositoryName: string,
): CustomArchitectMetaModel {
  try {
    const raw = localStorage.getItem(getStorageKey(repositoryName));
    if (!raw) return { elementTypes: [], relationshipTypes: [] };
    const parsed = JSON.parse(raw);
    return {
      elementTypes: Array.isArray(parsed?.elementTypes)
        ? parsed.elementTypes
        : [],
      relationshipTypes: Array.isArray(parsed?.relationshipTypes)
        ? parsed.relationshipTypes
        : [],
    };
  } catch {
    return { elementTypes: [], relationshipTypes: [] };
  }
}

function saveCustomMetaModel(
  repositoryName: string,
  model: CustomArchitectMetaModel,
): void {
  try {
    localStorage.setItem(getStorageKey(repositoryName), JSON.stringify(model));
  } catch {
    // Best-effort only.
  }
}

// ---------------------------------------------------------------------------
// Element Types
// ---------------------------------------------------------------------------

export function addCustomElementType(
  repositoryName: string,
  input: Omit<CustomElementType, 'id' | 'createdAt' | 'updatedAt'>,
): CustomElementType {
  const model = loadCustomMetaModel(repositoryName);
  const now = nowIso();
  const entry: CustomElementType = {
    ...input,
    id: makeId(),
    createdAt: now,
    updatedAt: now,
  };
  model.elementTypes.push(entry);
  saveCustomMetaModel(repositoryName, model);

  try {
    window.dispatchEvent(new Event('ea:customMetaModelChanged'));
  } catch {
    // ignore
  }

  return entry;
}

export function updateCustomElementType(
  repositoryName: string,
  id: string,
  patch: Partial<Omit<CustomElementType, 'id' | 'createdAt'>>,
): CustomElementType | null {
  const model = loadCustomMetaModel(repositoryName);
  const idx = model.elementTypes.findIndex((t) => t.id === id);
  if (idx < 0) return null;
  model.elementTypes[idx] = {
    ...model.elementTypes[idx],
    ...patch,
    updatedAt: nowIso(),
  };
  saveCustomMetaModel(repositoryName, model);
  try {
    window.dispatchEvent(new Event('ea:customMetaModelChanged'));
  } catch {
    // ignore
  }
  return model.elementTypes[idx];
}

export function removeCustomElementType(
  repositoryName: string,
  id: string,
): boolean {
  const model = loadCustomMetaModel(repositoryName);
  const before = model.elementTypes.length;
  model.elementTypes = model.elementTypes.filter((t) => t.id !== id);
  // Also remove relationships using this type
  model.relationshipTypes = model.relationshipTypes.filter(
    (r) => r.sourceElementTypeId !== id && r.targetElementTypeId !== id,
  );
  saveCustomMetaModel(repositoryName, model);
  try {
    window.dispatchEvent(new Event('ea:customMetaModelChanged'));
  } catch {
    // ignore
  }
  return model.elementTypes.length < before;
}

// ---------------------------------------------------------------------------
// Relationship Types
// ---------------------------------------------------------------------------

export function addCustomRelationshipType(
  repositoryName: string,
  input: Omit<CustomRelationshipType, 'id' | 'createdAt' | 'updatedAt'>,
): CustomRelationshipType {
  const model = loadCustomMetaModel(repositoryName);
  const now = nowIso();
  const entry: CustomRelationshipType = {
    ...input,
    id: makeId(),
    createdAt: now,
    updatedAt: now,
  };
  model.relationshipTypes.push(entry);
  saveCustomMetaModel(repositoryName, model);
  try {
    window.dispatchEvent(new Event('ea:customMetaModelChanged'));
  } catch {
    // ignore
  }
  return entry;
}

export function updateCustomRelationshipType(
  repositoryName: string,
  id: string,
  patch: Partial<Omit<CustomRelationshipType, 'id' | 'createdAt'>>,
): CustomRelationshipType | null {
  const model = loadCustomMetaModel(repositoryName);
  const idx = model.relationshipTypes.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  model.relationshipTypes[idx] = {
    ...model.relationshipTypes[idx],
    ...patch,
    updatedAt: nowIso(),
  };
  saveCustomMetaModel(repositoryName, model);
  try {
    window.dispatchEvent(new Event('ea:customMetaModelChanged'));
  } catch {
    // ignore
  }
  return model.relationshipTypes[idx];
}

export function removeCustomRelationshipType(
  repositoryName: string,
  id: string,
): boolean {
  const model = loadCustomMetaModel(repositoryName);
  const before = model.relationshipTypes.length;
  model.relationshipTypes = model.relationshipTypes.filter((r) => r.id !== id);
  saveCustomMetaModel(repositoryName, model);
  try {
    window.dispatchEvent(new Event('ea:customMetaModelChanged'));
  } catch {
    // ignore
  }
  return model.relationshipTypes.length < before;
}

// ---------------------------------------------------------------------------
// Toolbox integration helpers
// ---------------------------------------------------------------------------

const ICON_SHAPE_MAP: Record<string, string> = {
  rectangle:
    '<rect x="3" y="4" width="14" height="12" rx="1" fill="{{fill}}" stroke="{{stroke}}" stroke-width="1.4"/>',
  'round-rectangle':
    '<rect x="3" y="4" width="14" height="12" rx="3" fill="{{fill}}" stroke="{{stroke}}" stroke-width="1.4"/>',
  ellipse:
    '<ellipse cx="10" cy="10" rx="6" ry="5" fill="{{fill}}" stroke="{{stroke}}" stroke-width="1.4"/>',
  diamond:
    '<polygon points="10,3 17,10 10,17 3,10" fill="{{fill}}" stroke="{{stroke}}" stroke-width="1.4"/>',
  hexagon:
    '<polygon points="6,3 14,3 18,10 14,17 6,17 2,10" fill="{{fill}}" stroke="{{stroke}}" stroke-width="1.4"/>',
};

/**
 * Build a data-URI SVG icon for a custom element type.
 */
export function buildCustomElementIcon(
  color: string,
  iconShape: string = 'round-rectangle',
): string {
  const template =
    ICON_SHAPE_MAP[iconShape] ?? ICON_SHAPE_MAP['round-rectangle'];
  const body = template
    .replace('{{fill}}', color || '#e6f7ff')
    .replace('{{stroke}}', color || '#1890ff');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">${body}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * Synthetic EaVisual entry shape for a custom element type toolbox item.
 */
export type CustomToolboxVisual = {
  kind: string;
  type: string;
  layer: string;
  label: string;
  shape: string;
  icon: string;
  color: string;
  border: string;
  isCustomArchitectType: true;
};

/**
 * Build the list of synthetic toolbox entries for all custom element types.
 */
export function buildCustomToolboxVisuals(
  repositoryName: string,
): CustomToolboxVisual[] {
  const model = loadCustomMetaModel(repositoryName);
  return model.elementTypes.map((et) => ({
    kind: `custom-${et.id}`,
    type: et.name,
    layer: 'Custom',
    label: et.name,
    shape: et.icon || 'round-rectangle',
    icon: buildCustomElementIcon(et.color, et.icon),
    color: et.color || 'transparent',
    border: et.color || 'transparent',
    isCustomArchitectType: true as const,
  }));
}

/**
 * Build the list of synthetic relationship palette entries for custom
 * relationship types.
 */
export type CustomToolboxRelationship = {
  type: string;
  label: string;
  sourceTypeId: string;
  targetTypeId: string;
  color: string;
  lineStyle: string;
  arrowDirection: string;
  isCustomArchitectType: true;
};

export function buildCustomToolboxRelationships(
  repositoryName: string,
): CustomToolboxRelationship[] {
  const model = loadCustomMetaModel(repositoryName);
  const elMap = new Map(model.elementTypes.map((e) => [e.id, e]));
  return model.relationshipTypes.map((rt) => ({
    type: rt.name,
    label: rt.name,
    sourceTypeId: rt.sourceElementTypeId,
    targetTypeId: rt.targetElementTypeId,
    color: rt.color || '#8c8c8c',
    lineStyle: rt.lineStyle || 'solid',
    arrowDirection: rt.arrowDirection || 'forward',
    isCustomArchitectType: true as const,
    sourceLabel: elMap.get(rt.sourceElementTypeId)?.name ?? '?',
    targetLabel: elMap.get(rt.targetElementTypeId)?.name ?? '?',
  }));
}
