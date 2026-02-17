import { isValidObjectType, type ObjectType, type RelationshipType } from './eaMetaModel';

export type ProgrammeMappingsCsvRow = {
  programmeId: string;
  mappedId: string;
  mappedType: ObjectType;
  relationshipType: RelationshipType;
  attributes: Record<string, unknown>;
};

export type ProgrammeMappingsCsvParseSuccess = {
  ok: true;
  mappings: ProgrammeMappingsCsvRow[];
};

export type ProgrammeMappingsCsvParseFailure = {
  ok: false;
  errors: string[];
};

export type ProgrammeMappingsCsvParseResult =
  | ProgrammeMappingsCsvParseSuccess
  | ProgrammeMappingsCsvParseFailure;

const normalizeHeader = (value: string) => value.trim().toLowerCase();

const stripBom = (text: string) => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);

const parseCsv = (inputText: string): string[][] => {
  const text = stripBom(inputText);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = '';
  };

  const pushRow = () => {
    const allEmpty = row.every((c) => c.trim() === '');
    if (!(row.length === 1 && allEmpty)) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        const next = text[i + 1];
        if (next === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === ',') {
      pushField();
      continue;
    }

    if (ch === '\n') {
      pushField();
      pushRow();
      continue;
    }

    if (ch === '\r') {
      if (text[i + 1] === '\n') i += 1;
      pushField();
      pushRow();
      continue;
    }

    field += ch;
  }

  pushField();
  pushRow();

  while (rows.length > 0 && rows[rows.length - 1].every((c) => c.trim() === '')) rows.pop();

  return rows;
};

export function parseAndValidateProgrammeMappingsCsv(csvText: string): ProgrammeMappingsCsvParseResult {
  const errors: string[] = [];

  const rows = parseCsv(csvText);
  if (rows.length === 0) return { ok: false, errors: ['CSV is empty.'] };

  const header = rows[0].map(normalizeHeader);
  const requiredColumns = ['programmeid', 'mappedid', 'mappedtype'] as const;

  const indexByColumn = new Map<string, number>();
  header.forEach((h, idx) => {
    if (h) indexByColumn.set(h, idx);
  });

  const missing = requiredColumns.filter((col) => !indexByColumn.has(col));
  if (missing.length > 0) {
    return { ok: false, errors: [`Missing required column(s): ${missing.join(', ')}.`] };
  }

  const relationshipTypeIdx = indexByColumn.get('relationshiptype');

  const isAllowedMappedType = (t: ObjectType) =>
    t === 'Application' || t === 'CapabilityCategory' || t === 'Capability' || t === 'SubCapability';

  const mappings: ProgrammeMappingsCsvRow[] = [];

  for (let r = 1; r < rows.length; r += 1) {
    const row = rows[r];
    if (row.every((c) => c.trim() === '')) continue;

    const displayRow = r + 1;

    const rawProgrammeId = (row[indexByColumn.get('programmeid')!] ?? '').trim();
    const rawMappedId = (row[indexByColumn.get('mappedid')!] ?? '').trim();
    const rawMappedType = (row[indexByColumn.get('mappedtype')!] ?? '').trim();

    const rawRelType =
      relationshipTypeIdx === undefined ? '' : (row[relationshipTypeIdx] ?? '').trim().toUpperCase();

    if (!rawProgrammeId) errors.push(`Row ${displayRow}: programmeId is required.`);
    if (!rawMappedId) errors.push(`Row ${displayRow}: mappedId is required.`);

    if (!rawMappedType) {
      errors.push(`Row ${displayRow}: mappedType is required.`);
    } else if (!isValidObjectType(rawMappedType)) {
      errors.push(`Row ${displayRow}: mappedType is invalid (got "${rawMappedType}").`);
    } else if (!isAllowedMappedType(rawMappedType)) {
      errors.push(
        `Row ${displayRow}: mappedType must be CapabilityCategory | Capability | SubCapability | Application (got "${rawMappedType}").`,
      );
    }

    // Mapping rule: programme -> capability/application always uses DELIVERS.
    const relationshipType: RelationshipType = 'DELIVERS';
    if (rawRelType && rawRelType !== 'DELIVERS') {
      errors.push(
        `Row ${displayRow}: relationshipType must be DELIVERS for Programme mappings (got "${rawRelType}").`,
      );
    }

    const attributes: Record<string, unknown> = {};
    for (const [col, idx] of indexByColumn) {
      if (col === 'programmeid' || col === 'mappedid' || col === 'mappedtype' || col === 'relationshiptype') continue;
      const value = (row[idx] ?? '').trim();
      if (value !== '') attributes[col] = value;
    }

    if (
      rawProgrammeId &&
      rawMappedId &&
      rawMappedType &&
      isValidObjectType(rawMappedType) &&
      isAllowedMappedType(rawMappedType) &&
      (!rawRelType || rawRelType === 'DELIVERS')
    ) {
      mappings.push({
        programmeId: rawProgrammeId,
        mappedId: rawMappedId,
        mappedType: rawMappedType,
        relationshipType,
        attributes,
      });
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  if (mappings.length === 0) return { ok: false, errors: ['No programme mapping rows found.'] };

  return { ok: true, mappings };
}
