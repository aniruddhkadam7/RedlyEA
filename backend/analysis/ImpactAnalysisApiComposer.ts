import { DomainError } from '../reliability/DomainError';
import type { ImpactQuerySafeguards } from './ImpactAnalysisEngine';
import { impactAnalysisEngine } from './ImpactAnalysisEngine';
import type { ImpactAnalysisRequest } from './ImpactAnalysisRequest';
import type { ImpactAnalysisAuditRecord } from './ImpactAudit';
import { impactAuditTrail } from './ImpactAuditTrail';
import type { ImpactPath } from './ImpactPath';
import type { ImpactRankedElement } from './ImpactRanking';
import { impactRanking } from './ImpactRanking';
import { impactSeverityScorer } from './ImpactSeverityScorer';
import type { ImpactSummary } from './ImpactSummary';

const asTrimmedString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

export type ComposeImpactAnalysisResponseOptions = {
  includePaths: boolean;
  safeguards?: Partial<ImpactQuerySafeguards>;
  abortSignal?: AbortSignal;
  /** Optional wall-clock timeout for this analysis run. */
  timeoutMs?: number;
};

export type ImpactAnalysisResponseData = {
  audit: ImpactAnalysisAuditRecord | null;
  warnings: readonly string[];
  analysisStats: {
    expandedNodeCount: number;
    enumeratedPathCount: number;
    aborted: boolean;
  };
  impactSummary: ImpactSummary;
  rankedImpacts: readonly ImpactRankedElement[];
  impactPaths?: readonly ImpactPath[];
};

export const composeImpactAnalysisResponse = async (
  request: ImpactAnalysisRequest,
  options: ComposeImpactAnalysisResponseOptions,
): Promise<ImpactAnalysisResponseData> => {
  const includePaths = options.includePaths === true;

  const analysis = await impactAnalysisEngine.analyze(request, {
    includePaths,
    safeguards: options.safeguards,
    abortSignal: options.abortSignal,
    timeoutMs: options.timeoutMs,
  });

  // Explicit timeout handling: return an error (no silent partials).
  if (analysis.stats.aborted && analysis.stats.abortedReason === 'Timeout') {
    throw new DomainError({
      code: 'ANALYSIS_TIMEOUT',
      message: 'Impact analysis timed out.',
      retryable: true,
      details: {
        rootElementId: request.rootElementId,
        maxDepth: request.maxDepth,
      },
    });
  }

  const evidence = analysis.evidence;

  const scores = evidence.map((e) =>
    impactSeverityScorer.score({
      elementId: e.elementId,
      totalPaths: e.totalPathsAffectingElement,
      hardPathCount: e.hardPathCount,
      softOnlyPathCount: e.softOnlyPathCount,
      elementCriticality: 'Unknown',
    }),
  );

  const rankedImpacts = impactRanking.rank({
    rootElementId: request.rootElementId,
    evidenceByElement: evidence,
    scoresByElement: scores,
  });

  const severityBreakdown = { High: 0, Medium: 0, Low: 0 } as const;
  const breakdown = { ...severityBreakdown };
  for (const s of scores) breakdown[s.severityLabel] += 1;

  const maxDependencyDepthObserved = evidence.reduce(
    (max, e) => Math.max(max, e.maxDepthObserved),
    0,
  );

  const summary: ImpactSummary = {
    rootElementId: request.rootElementId,
    totalImpactedElements: rankedImpacts.length,
    severityBreakdown: breakdown,
    maxDependencyDepthObserved,
    analysisTimestamp: new Date().toISOString(),
  };

  // Passive audit trail (metadata only). Must never block usage.
  let audit: ImpactAnalysisAuditRecord | null = null;
  try {
    audit = impactAuditTrail.record({
      requestId: request.requestId,
      repositoryName: asTrimmedString((request as any)?.repositoryName),
      ranBy: asTrimmedString(request.requestedBy) || 'unknown',
      ranAt: new Date().toISOString(),
      parameters: {
        rootElementId: request.rootElementId,
        rootElementType: request.rootElementType,
        direction: request.direction,
        maxDepth: request.maxDepth,
        includedRelationshipTypes: request.includedRelationshipTypes,
        analysisIntent: request.analysisIntent,
        includePaths,
      },
    });
  } catch {
    audit = null;
  }

  return {
    audit,
    warnings: analysis.warnings,
    analysisStats: analysis.stats,
    impactSummary: summary,
    rankedImpacts,
    ...(includePaths
      ? { impactPaths: (analysis.paths ?? []) as readonly ImpactPath[] }
      : {}),
  };
};
