import type {
  DatasetInfo,
  ImpactSummary,
} from '../components/ApplicationSidePanel';

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

export function buildImpactSummaryCsv(args: {
  datasetInfo: DatasetInfo;
  impactSummary: ImpactSummary;
}): string {
  const { datasetInfo, impactSummary } = args;

  const headers = [
    'datasetSource',
    'loadedAt',
    'totalImpactedApplications',
    'highSeverityCount',
    'mediumSeverityCount',
    'lowSeverityCount',
    'maxDependencyDepth',
  ];

  const values = [
    datasetInfo.source,
    new Date(datasetInfo.loadedAt).toISOString(),
    String(impactSummary.totalImpactedApplications),
    String(impactSummary.bySeverityLabel.High),
    String(impactSummary.bySeverityLabel.Medium),
    String(impactSummary.bySeverityLabel.Low),
    String(impactSummary.maxDependencyDepthObserved),
  ].map(csvEscape);

  return `${headers.join(',')}\n${values.join(',')}\n`;
}
