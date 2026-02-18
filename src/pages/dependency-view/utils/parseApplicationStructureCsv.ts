export type ApplicationStructureCsvRow = {
  department: string;
  applicationId: string;
  applicationName?: string;
  attributes: Record<string, unknown>;
};

export type ApplicationStructureCsvParseSuccess = {
  ok: true;
  rows: ApplicationStructureCsvRow[];
};

export type ApplicationStructureCsvParseFailure = {
  ok: false;
  errors: string[];
};

export type ApplicationStructureCsvParseResult =
  | ApplicationStructureCsvParseSuccess
  | ApplicationStructureCsvParseFailure;

const normalizeHeader = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]/g, '');

const stripBom = (text: string) =>
  text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

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

export function parseAndValidateApplicationStructureCsv(
  csvText: string,
  opts?: { sourceLabel?: string },
): ApplicationStructureCsvParseResult {
  const errors: string[] = [];

  const rows = parseCsv(csvText);
  if (rows.length === 0) return { ok: false, errors: ['CSV is empty.'] };

  const header = rows[0].map(normalizeHeader);

  const indexByColumn = new Map<string, number>();
  header.forEach((h, idx) => {
    if (h) indexByColumn.set(h, idx);
  });

  const departmentIdx =
    indexByColumn.get('department') ?? indexByColumn.get('dept');
  const applicationIdIdx = indexByColumn.get('applicationid');
  const applicationNameIdx = indexByColumn.get('applicationname');

  const missing: string[] = [];
  if (departmentIdx === undefined) missing.push('department');
  if (applicationIdIdx === undefined) missing.push('application_id');

  if (missing.length > 0) {
    return {
      ok: false,
      errors: [
        `Missing required column(s): ${missing.join(', ')}. Expected headers like: department, application_id, application_name.`,
      ],
    };
  }

  const parsedRows: ApplicationStructureCsvRow[] = [];

  const deptIdx = departmentIdx;
  const appIdIdx = applicationIdIdx;

  for (let r = 1; r < rows.length; r += 1) {
    const row = rows[r];
    if (row.every((c) => c.trim() === '')) continue;

    const displayRow = r + 1;

    const department = (row[deptIdx!] ?? '').trim();
    const applicationId = (row[appIdIdx!] ?? '').trim();
    const applicationName =
      applicationNameIdx === undefined
        ? undefined
        : (row[applicationNameIdx] ?? '').trim();

    if (!department) errors.push(`Row ${displayRow}: department is required.`);
    if (!applicationId)
      errors.push(`Row ${displayRow}: application_id is required.`);

    const attributes: Record<string, unknown> = {};
    for (const [col, idx] of indexByColumn) {
      if (
        idx === departmentIdx ||
        idx === applicationIdIdx ||
        idx === applicationNameIdx
      )
        continue;
      const value = (row[idx] ?? '').trim();
      if (value !== '') attributes[col] = value;
    }

    if (department && applicationId) {
      parsedRows.push({
        department,
        applicationId,
        applicationName: applicationName || undefined,
        attributes,
      });
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  if (parsedRows.length === 0) {
    return {
      ok: false,
      errors: [
        `No application structure rows found${opts?.sourceLabel ? ` in ${opts.sourceLabel}` : ''}.`,
      ],
    };
  }

  return { ok: true, rows: parsedRows };
}
