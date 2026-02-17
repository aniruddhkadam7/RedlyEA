export type ImpactAnalysisSectionKey =
  | 'overview'
  | 'fragility'
  | 'simulation'
  | 'explorer'
  | 'health'
  | 'settings';

export const IMPACT_ANALYSIS_SECTION_EVENT = 'ea:analysis.impact.section';

export const DEFAULT_IMPACT_ANALYSIS_SECTION: ImpactAnalysisSectionKey = 'overview';

export const dispatchImpactAnalysisSection = (section: ImpactAnalysisSectionKey) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(IMPACT_ANALYSIS_SECTION_EVENT, {
      detail: { section },
    }),
  );
};
