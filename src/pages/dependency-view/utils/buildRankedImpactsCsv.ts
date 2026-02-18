import type { RankedImpactItem } from '../components/ApplicationSidePanel';

const csvEscape = (value: string) => {
  if (
    value.includes('"') ||
    value.includes(',') ||
    value.includes('\n') ||
    value.includes('\r')
  ) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
};

export function buildRankedImpactsCsv(
  rankedImpacts: ReadonlyArray<RankedImpactItem>,
): string {
  const headers = ['rank', 'applicationName', 'severityLabel', 'severityScore'];

  const lines: string[] = [headers.join(',')];

  for (let i = 0; i < rankedImpacts.length; i += 1) {
    const item = rankedImpacts[i];
    const values = [
      String(i + 1),
      item.applicationName,
      item.severityLabel,
      String(item.severityScore),
    ].map(csvEscape);

    lines.push(values.join(','));
  }

  return `${lines.join('\n')}\n`;
}
