import type { EaRepository } from '@/pages/dependency-view/utils/eaRepository';

export type ImpactSystemMetrics = {
  systemId: string;
  systemName: string;
  systemType: string;
  inboundDependencies: number;
  outboundDependencies: number;
  dependencyDepth: number;
  downstreamReach: number;
  impactScore: number;
  redundancyStatus: 'Single Path' | 'Redundant';
};

export type ImpactOverviewMetrics = {
  totalSystems: number;
  totalRelationships: number;
  averageDependencyDepth: number;
  longestDependencyChain: number;
  singlePointsOfFailure: number;
  architectureImpactScore: number;
};

export type DependencyGraphSnapshot = {
  fingerprint: string;
  nodes: Array<{ id: string; name: string; type: string }>;
  edges: Array<{ id: string; fromId: string; toId: string; type: string }>;
  outgoing: Map<string, string[]>;
  incoming: Map<string, string[]>;
};

export type DependencyTier = 'Low' | 'Medium' | 'High';
export type RiskLevel = 'Low' | 'Medium' | 'High' | 'Critical';
export type CascadeRiskLevel = 'Low' | 'Medium' | 'High';
export type WarningKey =
  | 'circular'
  | 'centralization'
  | 'deep'
  | 'isolated'
  | 'hub';

export type DashboardSystemMetrics = ImpactSystemMetrics & {
  rank: number;
  reachPercent: number;
  centralizationPercent: number;
  densityRatio: number;
  riskLevel: RiskLevel;
};

export type DashboardMetrics = {
  dependencyTierDistribution: Array<{
    tier: DependencyTier;
    count: number;
    percentage: number;
  }>;
  depthDistribution: Array<{ depth: number; count: number }>;
  top10ImpactfulSystems: DashboardSystemMetrics[];
  riskSystems: DashboardSystemMetrics[];
  blastRadiusDistribution: Array<{
    severity: RiskLevel;
    count: number;
    percentage: number;
  }>;
  warningPanel: Array<{
    key: WarningKey;
    label: string;
    count: number;
    severity: 'success' | 'processing' | 'warning' | 'error';
    systemIds: string[];
  }>;
  stabilityScore: number;
  concentrationRiskPercent: number;
  concentrationIndex: number;
  cascadeRiskIndex: number;
  cascadeRiskLevel: CascadeRiskLevel;
  graphDensityRatio: number;
  insights: string[];
  healthScorePercent: number;
};

export type ImpactAnalysisSnapshot = {
  fingerprint: string;
  overview: ImpactOverviewMetrics;
  systems: ImpactSystemMetrics[];
  topImpactfulSystems: ImpactSystemMetrics[];
  topFragileSystems: ImpactSystemMetrics[];
  orphanSystems: ImpactSystemMetrics[];
  highCentralitySystems: ImpactSystemMetrics[];
  metadataGaps: Array<{
    systemId: string;
    systemName: string;
    missingFields: string[];
  }>;
  graph: DependencyGraphSnapshot;
  cycleNodeCount: number;
  isolatedNodeCount: number;
  dashboard: DashboardMetrics;
};

export type SimulationMode = 'outbound' | 'inbound' | 'full';

export type ImpactSimulationResult = {
  rootId: string;
  mode: SimulationMode;
  affectedIds: Set<string>;
  maxDepth: number;
  cascadingLevel: number;
  severity: 'Low' | 'Medium' | 'High';
};

const MAX_CACHE_ENTRIES = 8;

const cache = new Map<string, ImpactAnalysisSnapshot>();

const normalize = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

const fnv1aHash = (input: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `v1-${(hash >>> 0).toString(16).padStart(8, '0')}`;
};

const buildRepositoryFingerprint = (repository: EaRepository): string => {
  const nodeTokens: string[] = [];
  for (const obj of repository.objects.values()) {
    if ((obj.attributes as any)?._deleted === true) continue;
    nodeTokens.push(`${obj.id}|${obj.type}`);
  }
  nodeTokens.sort((a, b) => a.localeCompare(b));

  const edgeTokens: string[] = [];
  for (const relationship of repository.relationships) {
    const fromId = normalize(relationship.fromId);
    const toId = normalize(relationship.toId);
    if (!fromId || !toId) continue;
    edgeTokens.push(`${relationship.type}|${fromId}|${toId}`);
  }
  edgeTokens.sort((a, b) => a.localeCompare(b));

  return fnv1aHash(`${nodeTokens.join('~')}#${edgeTokens.join('~')}`);
};

const computeReach = (
  rootId: string,
  adjacency: Map<string, string[]>,
): { visited: Set<string>; maxDepth: number } => {
  const visited = new Set<string>([rootId]);
  const queue: Array<{ id: string; depth: number }> = [
    { id: rootId, depth: 0 },
  ];
  let maxDepth = 0;

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;

    const neighbors = adjacency.get(current.id) ?? [];
    for (const neighborId of neighbors) {
      if (visited.has(neighborId)) continue;
      visited.add(neighborId);
      const depth = current.depth + 1;
      if (depth > maxDepth) maxDepth = depth;
      queue.push({ id: neighborId, depth });
    }
  }

  return { visited, maxDepth };
};

const toAdjacency = (graph: DependencyGraphSnapshot) => ({
  outgoing: graph.outgoing,
  incoming: graph.incoming,
});

const detectCycleNodeCount = (
  adjacency: Map<string, string[]>,
  nodeIds: string[],
): number => {
  const state = new Map<string, 0 | 1 | 2>();
  const cycleNodes = new Set<string>();

  const dfs = (nodeId: string, stack: string[]) => {
    state.set(nodeId, 1);
    stack.push(nodeId);

    for (const next of adjacency.get(nodeId) ?? []) {
      const nextState = state.get(next) ?? 0;
      if (nextState === 0) {
        dfs(next, stack);
        continue;
      }
      if (nextState === 1) {
        const cycleStart = stack.lastIndexOf(next);
        if (cycleStart >= 0) {
          for (let i = cycleStart; i < stack.length; i += 1) {
            cycleNodes.add(stack[i]!);
          }
        }
      }
    }

    stack.pop();
    state.set(nodeId, 2);
  };

  for (const nodeId of nodeIds) {
    if ((state.get(nodeId) ?? 0) !== 0) continue;
    dfs(nodeId, []);
  }

  return cycleNodes.size;
};

export const getImpactAnalysisSnapshot = (
  repository: EaRepository,
): ImpactAnalysisSnapshot => {
  const fingerprint = buildRepositoryFingerprint(repository);
  const cached = cache.get(fingerprint);
  if (cached) return cached;

  const nodes = Array.from(repository.objects.values())
    .filter((obj) => (obj.attributes as any)?._deleted !== true)
    .map((obj) => ({
      id: obj.id,
      name:
        typeof obj.attributes.name === 'string' && obj.attributes.name.trim()
          ? String(obj.attributes.name)
          : obj.id,
      type: obj.type,
      attributes: obj.attributes,
    }));

  const nodeIdSet = new Set(nodes.map((node) => node.id));

  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  const edges: DependencyGraphSnapshot['edges'] = [];

  for (const relationship of repository.relationships) {
    const fromId = normalize(relationship.fromId);
    const toId = normalize(relationship.toId);
    if (!fromId || !toId) continue;
    if (!nodeIdSet.has(fromId) || !nodeIdSet.has(toId)) continue;

    if (!outgoing.has(fromId)) outgoing.set(fromId, []);
    outgoing.get(fromId)?.push(toId);

    if (!incoming.has(toId)) incoming.set(toId, []);
    incoming.get(toId)?.push(fromId);

    edges.push({
      id: relationship.id ?? `${relationship.type}:${fromId}->${toId}`,
      fromId,
      toId,
      type: relationship.type,
    });
  }

  const systems: ImpactSystemMetrics[] = nodes.map((node) => {
    const reach = computeReach(node.id, outgoing);
    const downstreamReach = Math.max(0, reach.visited.size - 1);
    const impactScore = downstreamReach + reach.maxDepth;

    const inboundDependencies = incoming.get(node.id)?.length ?? 0;
    const outboundDependencies = outgoing.get(node.id)?.length ?? 0;

    return {
      systemId: node.id,
      systemName: node.name,
      systemType: node.type,
      inboundDependencies,
      outboundDependencies,
      dependencyDepth: reach.maxDepth,
      downstreamReach,
      impactScore,
      redundancyStatus:
        inboundDependencies <= 1 || outboundDependencies <= 1
          ? 'Single Path'
          : 'Redundant',
    };
  });

  const byImpact = [...systems].sort((a, b) => {
    if (b.impactScore !== a.impactScore) return b.impactScore - a.impactScore;
    if (b.dependencyDepth !== a.dependencyDepth)
      return b.dependencyDepth - a.dependencyDepth;
    return a.systemName.localeCompare(b.systemName);
  });

  const byFragility = [...systems].sort((a, b) => {
    const fragA =
      a.impactScore + (a.redundancyStatus === 'Single Path' ? 2 : 0);
    const fragB =
      b.impactScore + (b.redundancyStatus === 'Single Path' ? 2 : 0);
    if (fragB !== fragA) return fragB - fragA;
    if (b.inboundDependencies !== a.inboundDependencies)
      return b.inboundDependencies - a.inboundDependencies;
    return a.systemName.localeCompare(b.systemName);
  });

  const longestDependencyChain = systems.reduce(
    (max, item) => Math.max(max, item.dependencyDepth),
    0,
  );
  const averageDependencyDepth =
    systems.length > 0
      ? Number(
          (
            systems.reduce((sum, item) => sum + item.dependencyDepth, 0) /
            systems.length
          ).toFixed(2),
        )
      : 0;
  const architectureImpactScore =
    systems.length > 0
      ? Number(
          (
            systems.reduce((sum, item) => sum + item.impactScore, 0) /
            systems.length
          ).toFixed(2),
        )
      : 0;

  const orphanSystems = systems.filter(
    (item) => item.inboundDependencies === 0 && item.outboundDependencies === 0,
  );
  const highCentralitySystems = [...systems]
    .sort(
      (a, b) =>
        b.inboundDependencies +
        b.outboundDependencies -
        (a.inboundDependencies + a.outboundDependencies),
    )
    .slice(0, 10);

  const metadataGaps = nodes
    .map((node) => {
      const missingFields: string[] = [];
      if (
        !(
          typeof node.attributes?.name === 'string' &&
          node.attributes.name.trim()
        )
      )
        missingFields.push('name');
      if (
        !(
          typeof node.attributes?.description === 'string' &&
          node.attributes.description.trim()
        )
      )
        missingFields.push('description');
      if (
        !(
          typeof node.attributes?.ownerName === 'string' &&
          node.attributes.ownerName.trim()
        )
      )
        missingFields.push('ownerName');
      return { systemId: node.id, systemName: node.name, missingFields };
    })
    .filter((gap) => gap.missingFields.length > 0);

  const singlePointsOfFailure = systems.filter(
    (item) =>
      item.downstreamReach > 0 && item.redundancyStatus === 'Single Path',
  ).length;

  const graph: DependencyGraphSnapshot = {
    fingerprint,
    nodes: nodes.map((node) => ({
      id: node.id,
      name: node.name,
      type: node.type,
    })),
    edges,
    outgoing,
    incoming,
  };

  /* ── Dashboard pre-computed metrics ── */
  const classifyTier = (depth: number): DependencyTier => {
    if (depth <= 1) return 'Low';
    if (depth <= 3) return 'Medium';
    return 'High';
  };

  const classifyRisk = (s: ImpactSystemMetrics): RiskLevel => {
    const fragScore =
      s.impactScore + (s.redundancyStatus === 'Single Path' ? 3 : 0);
    if (fragScore >= 12) return 'Critical';
    if (fragScore >= 7) return 'High';
    if (fragScore >= 3) return 'Medium';
    return 'Low';
  };

  const tierCounts: Record<DependencyTier, number> = {
    Low: 0,
    Medium: 0,
    High: 0,
  };
  const depthBuckets = new Map<number, number>();
  const riskBuckets: Record<RiskLevel, number> = {
    Low: 0,
    Medium: 0,
    High: 0,
    Critical: 0,
  };
  const total = systems.length || 1;

  const maxDegree = systems.reduce(
    (max, s) => Math.max(max, s.inboundDependencies + s.outboundDependencies),
    1,
  );
  const denominator = Math.max(1, total - 1);

  const systemsWithDashboard = systems.map((s) => {
    const reachPercent =
      total > 0 ? Number(((s.downstreamReach / total) * 100).toFixed(1)) : 0;
    const centralizationPercent = Number(
      (
        ((s.inboundDependencies + s.outboundDependencies) / maxDegree) *
        100
      ).toFixed(1),
    );
    const densityRatio = Number(
      ((s.inboundDependencies + s.outboundDependencies) / denominator).toFixed(
        3,
      ),
    );
    const riskLevel = classifyRisk(s);
    riskBuckets[riskLevel] += 1;
    return {
      ...s,
      rank: 0,
      reachPercent,
      centralizationPercent,
      densityRatio,
      riskLevel,
    } satisfies DashboardSystemMetrics;
  });

  for (const s of systems) {
    tierCounts[classifyTier(s.dependencyDepth)] += 1;
    depthBuckets.set(
      s.dependencyDepth,
      (depthBuckets.get(s.dependencyDepth) ?? 0) + 1,
    );
  }

  const dependencyTierDistribution: DashboardMetrics['dependencyTierDistribution'] =
    (['Low', 'Medium', 'High'] as DependencyTier[]).map((tier) => ({
      tier,
      count: tierCounts[tier],
      percentage: Number(((tierCounts[tier] / total) * 100).toFixed(1)),
    }));

  const maxDepthVal = longestDependencyChain;
  const depthDistribution: DashboardMetrics['depthDistribution'] = [];
  for (let d = 0; d <= maxDepthVal; d += 1) {
    depthDistribution.push({ depth: d, count: depthBuckets.get(d) ?? 0 });
  }

  const top10ImpactfulSystems = byImpact.slice(0, 10).map((s, i) => ({
    ...systemsWithDashboard.find((item) => item.systemId === s.systemId)!,
    rank: i + 1,
  }));

  const riskSystems = byFragility
    .filter((s) => s.impactScore > 0 || s.redundancyStatus === 'Single Path')
    .slice(0, 20)
    .map((s, i) => ({
      ...systemsWithDashboard.find((item) => item.systemId === s.systemId)!,
      rank: i + 1,
    }));

  const blastRadiusDistribution: DashboardMetrics['blastRadiusDistribution'] = (
    ['Low', 'Medium', 'High', 'Critical'] as RiskLevel[]
  ).map((severity) => ({
    severity,
    count: riskBuckets[severity],
    percentage: Number(((riskBuckets[severity] / total) * 100).toFixed(1)),
  }));

  /* Auto-generated executive insights */
  const insights: string[] = [];
  const highImpactCount = systems.filter(
    (s) => s.downstreamReach > 0 && s.downstreamReach >= total * 0.4,
  ).length;
  if (highImpactCount > 0)
    insights.push(
      `${highImpactCount} system${highImpactCount > 1 ? 's' : ''} affect${highImpactCount === 1 ? 's' : ''} more than 40% of the architecture.`,
    );
  if (longestDependencyChain > 0)
    insights.push(
      `Longest dependency chain is ${longestDependencyChain} level${longestDependencyChain > 1 ? 's' : ''} deep.`,
    );
  const noRedundancy = systems.filter(
    (s) => s.redundancyStatus === 'Single Path' && s.downstreamReach > 0,
  ).length;
  if (noRedundancy > 0)
    insights.push(
      `${noRedundancy} system${noRedundancy > 1 ? 's have' : ' has'} no redundancy (single dependency path).`,
    );
  if (orphanSystems.length > 0)
    insights.push(
      `${orphanSystems.length} isolated system${orphanSystems.length > 1 ? 's are' : ' is'} disconnected from the dependency graph.`,
    );
  const cycleCount = detectCycleNodeCount(
    outgoing,
    nodes.map((node) => node.id),
  );
  if (cycleCount > 0)
    insights.push(
      `${cycleCount} system${cycleCount > 1 ? 's are' : ' is'} involved in circular dependencies.`,
    );
  if (metadataGaps.length > 0)
    insights.push(
      `${metadataGaps.length} system${metadataGaps.length > 1 ? 's are' : ' is'} missing key metadata (name, description, or owner).`,
    );
  if (insights.length === 0)
    insights.push(
      'Architecture appears healthy with no critical dependency issues detected.',
    );

  /* Health score: 100 = perfect, penalized by issues */
  const penalties =
    Math.min(30, singlePointsOfFailure * 5) +
    Math.min(20, cycleCount * 10) +
    Math.min(15, orphanSystems.length * 3) +
    Math.min(15, Math.max(0, longestDependencyChain - 3) * 5) +
    Math.min(20, Math.floor((metadataGaps.length / total) * 20));
  const healthScorePercent = Math.max(0, 100 - penalties);

  const graphDensityRatio = Number((edges.length / total).toFixed(2));
  const concentrationRiskPercent = Number(
    (((top10ImpactfulSystems[0]?.downstreamReach ?? 0) / total) * 100).toFixed(
      1,
    ),
  );

  const concentrationIndex = Number(
    Math.min(
      100,
      systemsWithDashboard.reduce((sum, s) => {
        const share = (s.downstreamReach + 1) / (total + systems.length);
        return sum + share * share;
      }, 0) * 100,
    ).toFixed(1),
  );

  const cascadeRiskIndex = Number(
    Math.min(
      100,
      longestDependencyChain * 8 +
        singlePointsOfFailure * 4 +
        cycleCount * 6 +
        systemsWithDashboard.filter((s) => s.riskLevel === 'Critical').length *
          6,
    ).toFixed(1),
  );

  const cascadeRiskLevel: CascadeRiskLevel =
    cascadeRiskIndex >= 65 ? 'High' : cascadeRiskIndex >= 35 ? 'Medium' : 'Low';

  const warningPanel: DashboardMetrics['warningPanel'] = [
    {
      key: 'circular',
      label: 'Circular',
      count: cycleCount,
      severity: cycleCount > 0 ? 'error' : 'success',
      systemIds: byFragility
        .filter((s) => s.dependencyDepth > 1)
        .slice(0, 8)
        .map((s) => s.systemId),
    },
    {
      key: 'centralization',
      label: 'Centralized',
      count: systemsWithDashboard.filter((s) => s.centralizationPercent >= 70)
        .length,
      severity:
        systemsWithDashboard.filter((s) => s.centralizationPercent >= 70)
          .length > 0
          ? 'warning'
          : 'success',
      systemIds: systemsWithDashboard
        .filter((s) => s.centralizationPercent >= 70)
        .slice(0, 8)
        .map((s) => s.systemId),
    },
    {
      key: 'deep',
      label: 'Deep Chains',
      count: systemsWithDashboard.filter((s) => s.dependencyDepth >= 4).length,
      severity:
        systemsWithDashboard.filter((s) => s.dependencyDepth >= 4).length > 0
          ? 'processing'
          : 'success',
      systemIds: systemsWithDashboard
        .filter((s) => s.dependencyDepth >= 4)
        .slice(0, 8)
        .map((s) => s.systemId),
    },
    {
      key: 'isolated',
      label: 'Isolated',
      count: orphanSystems.length,
      severity: orphanSystems.length > 0 ? 'warning' : 'success',
      systemIds: orphanSystems.slice(0, 8).map((s) => s.systemId),
    },
    {
      key: 'hub',
      label: 'Hub Overload',
      count: systemsWithDashboard.filter(
        (s) => s.inboundDependencies + s.outboundDependencies >= 8,
      ).length,
      severity:
        systemsWithDashboard.filter(
          (s) => s.inboundDependencies + s.outboundDependencies >= 8,
        ).length > 0
          ? 'error'
          : 'success',
      systemIds: systemsWithDashboard
        .filter((s) => s.inboundDependencies + s.outboundDependencies >= 8)
        .slice(0, 8)
        .map((s) => s.systemId),
    },
  ];

  const dashboard: DashboardMetrics = {
    dependencyTierDistribution,
    depthDistribution,
    top10ImpactfulSystems,
    riskSystems,
    blastRadiusDistribution,
    warningPanel,
    stabilityScore: healthScorePercent,
    concentrationRiskPercent,
    concentrationIndex,
    cascadeRiskIndex,
    cascadeRiskLevel,
    graphDensityRatio,
    insights,
    healthScorePercent,
  };

  const snapshot: ImpactAnalysisSnapshot = {
    fingerprint,
    overview: {
      totalSystems: nodes.length,
      totalRelationships: edges.length,
      averageDependencyDepth,
      longestDependencyChain,
      singlePointsOfFailure,
      architectureImpactScore,
    },
    systems,
    topImpactfulSystems: byImpact.slice(0, 5),
    topFragileSystems: byFragility.slice(0, 5),
    orphanSystems,
    highCentralitySystems,
    metadataGaps,
    graph,
    cycleNodeCount: cycleCount,
    isolatedNodeCount: orphanSystems.length,
    dashboard,
  };

  cache.set(fingerprint, snapshot);
  if (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }

  return snapshot;
};

export const simulateImpact = (
  snapshot: ImpactAnalysisSnapshot,
  rootId: string,
  mode: SimulationMode,
): ImpactSimulationResult => {
  const { outgoing, incoming } = toAdjacency(snapshot.graph);
  const adjacency =
    mode === 'outbound'
      ? outgoing
      : mode === 'inbound'
        ? incoming
        : new Map<string, string[]>();

  if (mode === 'full') {
    const nodeIds = new Set<string>([...outgoing.keys(), ...incoming.keys()]);
    for (const nodeId of nodeIds) {
      const merged = new Set<string>([
        ...(outgoing.get(nodeId) ?? []),
        ...(incoming.get(nodeId) ?? []),
      ]);
      adjacency.set(nodeId, [...merged]);
    }
  }

  const reach = computeReach(rootId, adjacency);
  const affectedCount = Math.max(0, reach.visited.size - 1);
  const ratio =
    snapshot.overview.totalSystems > 0
      ? affectedCount / snapshot.overview.totalSystems
      : 0;
  const severity: ImpactSimulationResult['severity'] =
    ratio >= 0.4 ? 'High' : ratio >= 0.15 ? 'Medium' : 'Low';

  return {
    rootId,
    mode,
    affectedIds: reach.visited,
    maxDepth: reach.maxDepth,
    cascadingLevel: reach.maxDepth,
    severity,
  };
};

export const clearImpactAnalysisCache = (): void => {
  cache.clear();
};
