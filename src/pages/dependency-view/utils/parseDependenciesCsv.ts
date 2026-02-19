export type DependenciesCsvRow = {
  from: string;
  to: string;
  dependencyStrength: 'hard' | 'soft';
  dependencyType?: string;
};

export type DependenciesCsvParseSuccess = {
  ok: true;
  dependencies: DependenciesCsvRow[];
};

export type DependenciesCsvParseFailure = {
  ok: false;
  errors: string[];
};

export type DependenciesCsvParseResult =
  | DependenciesCsvParseSuccess
  | DependenciesCsvParseFailure;

const normalizeHeader = (value: string) => value.trim().toLowerCase();

const stripBom = (text: string) =>
  text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

// Minimal CSV parser that supports:
// - commas
// - quoted fields with escaped quotes ("" -> ")
// - CRLF / LF newlines
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

  while (rows.length > 0 && rows[rows.length - 1].every((c) => c.trim() === ''))
    rows.pop();

  return rows;
};

export function parseAndValidateDependenciesCsv(
  csvText: string,
  opts: { existingApplicationIds: ReadonlySet<string> },
): DependenciesCsvParseResult {
  const errors: string[] = [];

  const rows = parseCsv(csvText);
  if (rows.length === 0) return { ok: false, errors: ['CSV is empty.'] };

  const header = rows[0].map(normalizeHeader);
  const requiredColumns = ['from', 'to', 'dependencystrength'] as const;

  const indexByColumn = new Map<string, number>();
  header.forEach((h, idx) => {
    if (h) indexByColumn.set(h, idx);
  });

  const missing = requiredColumns.filter((col) => !indexByColumn.has(col));
  if (missing.length > 0) {
    return {
      ok: false,
      errors: [`Missing required column(s): ${missing.join(', ')}.`],
    };
  }

  const dependencyTypeIdx = indexByColumn.get('dependencytype');

  const dependencies: DependenciesCsvRow[] = [];

  for (let r = 1; r < rows.length; r += 1) {
    const row = rows[r];
    if (row.every((c) => c.trim() === '')) continue;

    const displayRow = r + 1;

    const rawFrom = (row[indexByColumn.get('from') ?? 0] ?? '').trim();
    const rawTo = (row[indexByColumn.get('to') ?? 0] ?? '').trim();
    const rawStrength = (
      row[indexByColumn.get('dependencystrength') ?? 0] ?? ''
    )
      .trim()
      .toLowerCase();
    const rawType =
      dependencyTypeIdx === undefined
        ? ''
        : (row[dependencyTypeIdx] ?? '').trim();

    if (!rawFrom) errors.push(`Row ${displayRow}: from is required.`);
    if (!rawTo) errors.push(`Row ${displayRow}: to is required.`);

    if (rawFrom && !opts.existingApplicationIds.has(rawFrom)) {
      errors.push(
        `Row ${displayRow}: from references unknown application id "${rawFrom}".`,
      );
    }
    if (rawTo && !opts.existingApplicationIds.has(rawTo)) {
      errors.push(
        `Row ${displayRow}: to references unknown application id "${rawTo}".`,
      );
    }

    if (rawStrength !== 'hard' && rawStrength !== 'soft') {
      errors.push(
        `Row ${displayRow}: dependencyStrength must be hard | soft (got "${rawStrength || '(blank)'}").`,
      );
    }

    if (
      rawFrom &&
      rawTo &&
      opts.existingApplicationIds.has(rawFrom) &&
      opts.existingApplicationIds.has(rawTo) &&
      (rawStrength === 'hard' || rawStrength === 'soft')
    ) {
      dependencies.push({
        from: rawFrom,
        to: rawTo,
        dependencyStrength: rawStrength,
        dependencyType: rawType || undefined,
      });
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  if (dependencies.length === 0)
    return { ok: false, errors: ['No dependency rows found.'] };

  return { ok: true, dependencies };
}
