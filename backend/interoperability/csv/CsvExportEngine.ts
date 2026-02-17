import type { Project } from '../../project/project';
import { projectStore } from '../../project/ProjectStore';
import type { ExportScope } from '../ExportScope';
import type { CsvImportSourceEntity, CsvSchemaSpec } from './CsvImportSpecification';
import {
  APPLICATIONS_CSV_SCHEMA,
  BUSINESS_PROCESSES_CSV_SCHEMA,
  CAPABILITIES_CSV_SCHEMA,
  PROGRAMMES_CSV_SCHEMA,
  RELATIONSHIPS_CSV_SCHEMA,
  TECHNOLOGIES_CSV_SCHEMA,
} from './CsvImportSpecification';

import type { ArchitectureRepository } from '../../repository/ArchitectureRepository';
import type { BaseArchitectureElement } from '../../repository/BaseArchitectureElement';
import type { RelationshipRepository } from '../../repository/RelationshipRepository';
import type { BaseArchitectureRelationship } from '../../repository/BaseArchitectureRelationship';
import { getRepository } from '../../repository/RepositoryStore';
import { getRelationshipRepository } from '../../repository/RelationshipRepositoryStore';

export type CsvExportEngineFileName =
  | 'Capabilities.csv'
  | 'BusinessProcesses.csv'
  | 'Applications.csv'
  | 'Technologies.csv'
  | 'Programmes.csv'
  | 'Relationships.csv';

export type CsvExportEngineSuccess = {
  ok: true;

  /** Exported CSV strings by entity. */
  files: Partial<Record<CsvImportSourceEntity, { fileName: CsvExportEngineFileName; csvText: string }>>;

  exportedElementsCount: number;
  exportedRelationshipsCount: number;

  /** Non-fatal notes (deterministic ordering). */
  warnings: string[];
};

export type CsvExportEngineFailure = {
  ok: false;

  /** Deterministic list of blocking reasons. */
  errors: string[];
};

export type CsvExportEngineResult = CsvExportEngineSuccess | CsvExportEngineFailure;

export type CsvExportEngineOptions = {
  /** If omitted, uses ProjectStore. */
  project?: Project;

  /** If omitted, uses singleton stores. */
  repository?: ArchitectureRepository;
  relationshipRepository?: RelationshipRepository;
};

const schemaByEntity: Record<CsvImportSourceEntity, CsvSchemaSpec> = {
  Capabilities: CAPABILITIES_CSV_SCHEMA,
  BusinessProcesses: BUSINESS_PROCESSES_CSV_SCHEMA,
  Applications: APPLICATIONS_CSV_SCHEMA,
  Technologies: TECHNOLOGIES_CSV_SCHEMA,
  Programmes: PROGRAMMES_CSV_SCHEMA,
  Relationships: RELATIONSHIPS_CSV_SCHEMA,
};

const fileNameByEntity: Record<CsvImportSourceEntity, CsvExportEngineFileName> = {
  Capabilities: 'Capabilities.csv',
  BusinessProcesses: 'BusinessProcesses.csv',
  Applications: 'Applications.csv',
  Technologies: 'Technologies.csv',
  Programmes: 'Programmes.csv',
  Relationships: 'Relationships.csv',
};

const normalizeList = (values: readonly string[]) =>
  Array.from(
    new Set(
      (values ?? [])
        .map((v) => (typeof v === 'string' ? v.trim() : ''))
        .filter((v) => v.length > 0),
    ),
  ).sort((a, b) => a.localeCompare(b));

const csvEscape = (value: string): string => {
  // RFC4180-ish. Quote if it contains comma, quote or newline.
  const needsQuotes = /[\n\r,\"]/g.test(value);
  if (!needsQuotes) return value;
  return `"${value.replace(/\"/g, '""')}"`;
};

const toCellString = (value: unknown, columnName: string): string => {
  if (value === undefined) return '';
  if (value === null) return columnName === 'parentCapabilityId' ? 'null' : '';

  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    // Capabilities.maturityLevel expects "1".."5" in CSV spec.
    if (columnName === 'maturityLevel') return String(Math.trunc(value));
    return String(value);
  }

  // Deterministic fallback: JSON stringify (should be rare; internal models are scalar).
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const buildHeader = (schema: CsvSchemaSpec): string => schema.columns.map((c) => csvEscape(c.name)).join(',');

const buildRow = (schema: CsvSchemaSpec, record: Record<string, unknown>): string => {
  const cells = schema.columns.map((c) => {
    const raw = record[c.name];
    const str = toCellString(raw, c.name);
    return csvEscape(str);
  });
  return cells.join(',');
};

const isBlank = (v: unknown) => typeof v !== 'string' || v.trim().length === 0;

const uuidRegex =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

// Strict-enough ISO 8601 check (date or timestamp with Z).
const iso8601Regex = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z)?$/;

const validateCellImportCompatible = (schema: CsvSchemaSpec, colName: string, cell: string): string | null => {
  const col = schema.columns.find((c) => c.name === colName);
  if (!col) return null;

  const v = (cell ?? '').trim();
  const blank = v.length === 0;

  const allowBlank =
    col.type.startsWith('optional-') ||
    col.type === 'nullable-uuid' ||
    col.requiredCell === false ||
    col.requiredCell === undefined;

  if (blank) {
    if (col.requiredCell && !allowBlank) return `Missing required value for column "${col.name}".`;
    // Blank optional cell is import-compatible.
    return null;
  }

  switch (col.type) {
    case 'string':
    case 'optional-string':
      return null;

    case 'uuid':
      return uuidRegex.test(v) ? null : `Invalid UUID for column "${col.name}".`;

    case 'nullable-uuid':
      if (v.toLowerCase() === 'null') return null;
      return uuidRegex.test(v) ? null : `Invalid UUID/null for column "${col.name}".`;

    case 'iso8601':
    case 'optional-iso8601':
      return iso8601Regex.test(v) ? null : `Invalid ISO-8601 date/timestamp for column "${col.name}".`;

    case 'number':
    case 'optional-number': {
      const n = Number(v);
      return Number.isFinite(n) ? null : `Invalid number for column "${col.name}".`;
    }

    case 'boolean':
      return v === 'true' || v === 'false' ? null : `Invalid boolean (true/false) for column "${col.name}".`;

    case 'enum': {
      const allowed = col.enumValues ?? [];
      return allowed.includes(v) ? null : `Invalid enum value for column "${col.name}".`;
    }

    default:
      return `Unsupported CSV field type "${String(col.type)}" for column "${col.name}".`;
  }
};

const validateRowReimportable = (schema: CsvSchemaSpec, record: Record<string, unknown>): string[] => {
  const errors: string[] = [];

  for (const col of schema.columns) {
    const v = record[col.name];
    const cell = toCellString(v, col.name);
    const err = validateCellImportCompatible(schema, col.name, cell);
    if (err) errors.push(err);
  }

  return errors;
};

const sortElements = (a: BaseArchitectureElement, b: BaseArchitectureElement) =>
  a.elementType.localeCompare(b.elementType) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);

const sortRelationships = (a: BaseArchitectureRelationship, b: BaseArchitectureRelationship) =>
  a.relationshipType.localeCompare(b.relationshipType) ||
  a.sourceElementId.localeCompare(b.sourceElementId) ||
  a.targetElementId.localeCompare(b.targetElementId) ||
  a.id.localeCompare(b.id);

const toEntity = (elementType: string): Exclude<CsvImportSourceEntity, 'Relationships'> | null => {
  switch ((elementType ?? '').trim()) {
    case 'Capability':
      return 'Capabilities';
    case 'BusinessProcess':
      return 'BusinessProcesses';
    case 'Application':
      return 'Applications';
    case 'Technology':
      return 'Technologies';
    case 'Programme':
      return 'Programmes';
    default:
      return null;
  }
};

const resolveProject = (options?: CsvExportEngineOptions): Project | null =>
  options?.project ?? projectStore.getProject();

const resolveRepositories = (options?: CsvExportEngineOptions) => ({
  repository: options?.repository ?? getRepository(),
  relationshipRepository: options?.relationshipRepository ?? getRelationshipRepository(),
});

/**
 * CsvExportEngine
 *
 * Responsibilities:
 * - Export repository data to CSV per entity.
 * - Preserve IDs and relationships.
 * - Produce import-compatible CSVs (round-trippable without loss).
 *
 * Rules:
 * - Deterministic column order (schema-defined).
 * - Deterministic row order (stable sorting).
 * - No silent drops: invalid/partial exports fail with explicit errors.
 */
export function exportRepositoryToCsv(
  scope: ExportScope,
  options: CsvExportEngineOptions = {},
): CsvExportEngineResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const project = resolveProject(options);
  if (!project) {
    return {
      ok: false,
      errors: ['No project available. Create one in ProjectStore or pass options.project.'],
    };
  }

  if (scope.exportType !== 'Repository' && scope.exportType !== 'FullProject') {
    return {
      ok: false,
      errors: [`CsvExportEngine supports exportType Repository|FullProject (got "${scope.exportType}").`],
    };
  }

  // No defaults: caller must provide explicit lists (possibly empty).
  const includedElementTypes = normalizeList(scope.includedElementTypes);
  const includedRelationshipTypes = normalizeList(scope.includedRelationshipTypes);

  const { repository, relationshipRepository } = resolveRepositories(options);

  const files: Partial<Record<CsvImportSourceEntity, { fileName: CsvExportEngineFileName; csvText: string }>> = {};

  // Collect elements by entity.
  const elementRowsByEntity: Record<
    Exclude<CsvImportSourceEntity, 'Relationships'>,
    BaseArchitectureElement[]
  > = {
    Capabilities: [],
    BusinessProcesses: [],
    Applications: [],
    Technologies: [],
    Programmes: [],
  };

  const allElements = [
    ...repository.getElementsByType('capabilities'),
    ...repository.getElementsByType('businessProcesses'),
    ...repository.getElementsByType('applications'),
    ...repository.getElementsByType('technologies'),
    ...repository.getElementsByType('programmes'),
  ];

  for (const e of allElements) {
    if (includedElementTypes.length > 0 && !includedElementTypes.includes(e.elementType)) continue;
    const entity = toEntity(e.elementType);
    if (!entity) continue;
    elementRowsByEntity[entity].push(e);
  }

  // Export element CSVs.
  let exportedElementsCount = 0;
  for (const entity of Object.keys(elementRowsByEntity) as Array<Exclude<CsvImportSourceEntity, 'Relationships'>>) {
    const schema = schemaByEntity[entity];
    const rows = elementRowsByEntity[entity].slice().sort(sortElements);

    // If scope explicitly excludes this type, skip writing the file.
    const impliedType =
      entity === 'Capabilities'
        ? 'Capability'
        : entity === 'BusinessProcesses'
          ? 'BusinessProcess'
          : entity === 'Applications'
            ? 'Application'
            : entity === 'Technologies'
              ? 'Technology'
              : 'Programme';

    if (includedElementTypes.length > 0 && !includedElementTypes.includes(impliedType)) continue;

    const header = buildHeader(schema);
    const lines: string[] = [header];

    for (const element of rows) {
      const rowErrors = validateRowReimportable(schema, element as unknown as Record<string, unknown>);
      if (rowErrors.length > 0) {
        errors.push(
          `${entity}: element ${element.elementType} "${element.name}" (${element.id}) is not exportable: ${rowErrors.join(' ')}`,
        );
        continue;
      }

      lines.push(buildRow(schema, element as unknown as Record<string, unknown>));
      exportedElementsCount += 1;
    }

    files[entity] = {
      fileName: fileNameByEntity[entity],
      csvText: lines.join('\n') + '\n',
    };
  }

  // Relationships.
  let exportedRelationshipsCount = 0;
  const relationshipSchema = schemaByEntity.Relationships;
  const relationships = relationshipRepository
    .getAllRelationships()
    .filter((r) => (includedRelationshipTypes.length > 0 ? includedRelationshipTypes.includes(r.relationshipType) : true))
    .slice()
    .sort(sortRelationships);

  if (includedRelationshipTypes.length > 0 || scope.exportType === 'FullProject') {
    // Validate that relationship endpoints exist within the exported element set.
    const exportedElementIdSet = new Set<string>();
    for (const entity of Object.keys(elementRowsByEntity) as Array<Exclude<CsvImportSourceEntity, 'Relationships'>>) {
      for (const e of elementRowsByEntity[entity]) exportedElementIdSet.add(e.id);
    }

    for (const r of relationships) {
      if (!exportedElementIdSet.has(r.sourceElementId) || !exportedElementIdSet.has(r.targetElementId)) {
        errors.push(
          `Relationships: cannot export relationship ${r.relationshipType} (${r.id}) because its endpoints are outside the export scope (${r.sourceElementId} -> ${r.targetElementId}).`,
        );
      }
    }

    const header = buildHeader(relationshipSchema);
    const lines: string[] = [header];

    for (const r of relationships) {
      const rowErrors = validateRowReimportable(relationshipSchema, r as unknown as Record<string, unknown>);
      if (rowErrors.length > 0) {
        errors.push(
          `Relationships: relationship ${r.relationshipType} (${r.id}) is not exportable: ${rowErrors.join(' ')}`,
        );
        continue;
      }

      lines.push(buildRow(relationshipSchema, r as unknown as Record<string, unknown>));
      exportedRelationshipsCount += 1;
    }

    files.Relationships = {
      fileName: fileNameByEntity.Relationships,
      csvText: lines.join('\n') + '\n',
    };
  }

  // Views/governance artifacts are intentionally not exported here (CSV spec is entity-only).
  if (scope.includeViews) {
    warnings.push('includeViews=true was requested, but CsvExportEngine currently exports repository entities only.');
  }
  if (scope.includeGovernanceArtifacts) {
    warnings.push(
      'includeGovernanceArtifacts=true was requested, but CsvExportEngine currently exports repository entities only.',
    );
  }

  warnings.sort((a, b) => a.localeCompare(b));
  errors.sort((a, b) => a.localeCompare(b));

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    files,
    exportedElementsCount,
    exportedRelationshipsCount,
    warnings,
  };
}
