export type ProgrammesCsvRow = {
  id: string;
  name: string;
  attributes: Record<string, unknown>;
};

export type ProgrammesCsvParseSuccess = {
  ok: true;
  programmes: ProgrammesCsvRow[];
};

export type ProgrammesCsvParseFailure = {
  ok: false;
  errors: string[];
};

export type ProgrammesCsvParseResult = ProgrammesCsvParseSuccess | ProgrammesCsvParseFailure;

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

export function parseAndValidateProgrammesCsv(csvText: string): ProgrammesCsvParseResult {
  const errors: string[] = [];

  const rows = parseCsv(csvText);
  if (rows.length === 0) return { ok: false, errors: ['CSV is empty.'] };

  const header = rows[0].map(normalizeHeader);
  const requiredColumns = ['id', 'name'] as const;

  const indexByColumn = new Map<string, number>();
  header.forEach((h, idx) => {
    if (h) indexByColumn.set(h, idx);
  });

  const missing = requiredColumns.filter((col) => !indexByColumn.has(col));
  if (missing.length > 0) {
    return { ok: false, errors: [`Missing required column(s): ${missing.join(', ')}.`] };
  }

  const programmes: ProgrammesCsvRow[] = [];
  const seenIds = new Set<string>();

  for (let r = 1; r < rows.length; r += 1) {
    const row = rows[r];
    if (row.every((c) => c.trim() === '')) continue;

    const displayRow = r + 1;

    const rawId = (row[indexByColumn.get('id')!] ?? '').trim();
    const rawName = (row[indexByColumn.get('name')!] ?? '').trim();

    if (!rawId) errors.push(`Row ${displayRow}: id is required.`);
    if (!rawName) errors.push(`Row ${displayRow}: name is required.`);

    if (rawId) {
      if (seenIds.has(rawId)) errors.push(`Row ${displayRow}: duplicate id "${rawId}".`);
      else seenIds.add(rawId);
    }

    const attributes: Record<string, unknown> = {};
    for (const [col, idx] of indexByColumn) {
      if (col === 'id' || col === 'name') continue;
      const value = (row[idx] ?? '').trim();
      if (value !== '') attributes[col] = value;
    }

    if (rawId && rawName) {
      programmes.push({ id: rawId, name: rawName, attributes });
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  if (programmes.length === 0) return { ok: false, errors: ['No programme rows found.'] };

  return { ok: true, programmes };
}
