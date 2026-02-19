import {
  ApiOutlined,
  DashboardOutlined,
  ExclamationCircleOutlined,
  LinkOutlined,
  SafetyCertificateOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import type { ProColumns } from "@ant-design/pro-components";
import { PageContainer, ProCard, ProTable } from "@ant-design/pro-components";
import {
  Badge,
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Empty,
  Modal,
  Progress,
  Radio,
  Row,
  Select,
  Space,
  Statistic,
  Switch,
  Tabs,
  Tag,
  Typography,
} from "antd";
import React from "react";

import ErrorBoundary from "@/components/ErrorBoundary";

/* ---------- Safe chart imports ---------- */
let Pie: React.ComponentType<any> | null = null;
let Column: React.ComponentType<any> | null = null;
let Area: React.ComponentType<any> | null = null;
let Bar: React.ComponentType<any> | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const charts = require("@ant-design/charts");
  Pie = charts.Pie ?? null;
  Column = charts.Column ?? null;
  Area = charts.Area ?? null;
  Bar = charts.Bar ?? null;
} catch {
  // chart library failed to load — dashboards will show fallback text
}

const SafeChart: React.FC<{
  Chart: React.ComponentType<any> | null;
  props: Record<string, any>;
  label: string;
}> = ({ Chart, props: _chartProps, label: _label }) => {
  if (!Chart) return null;
  return (
    <ErrorBoundary fallback={null}>
      <Chart {..._chartProps} />
    </ErrorBoundary>
  );
};

import cytoscape, { type Core } from "cytoscape";
import {
  DEFAULT_IMPACT_ANALYSIS_SECTION,
  IMPACT_ANALYSIS_SECTION_EVENT,
  type ImpactAnalysisSectionKey,
} from "@/analysis/impactAnalysisMode";
import {
  type DashboardSystemMetrics,
  getImpactAnalysisSnapshot,
  type ImpactAnalysisSnapshot,
  type ImpactSimulationResult,
  type ImpactSystemMetrics,
  type RiskLevel,
  type SimulationMode,
  simulateImpact,
} from "@/analysis/impactDependencyEngine";
import { useEaRepository } from "@/ea/EaRepositoryContext";

type ReadOnlyImpactCanvasProps = {
  snapshot: ImpactAnalysisSnapshot;
  selectedId?: string;
  impactedIds?: Set<string>;
};

const ReadOnlyImpactCanvas: React.FC<ReadOnlyImpactCanvasProps> = ({
  snapshot,
  selectedId,
  impactedIds,
}) => {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const cyRef = React.useRef<Core | null>(null);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const hasImpact = impactedIds && impactedIds.size > 0;

    const nodeElements = snapshot.graph.nodes.map((node) => {
      const isSelected = selectedId === node.id;
      const isImpacted = impactedIds?.has(node.id) ?? false;
      const opacity = hasImpact && !isImpacted ? 0.25 : 1;
      const color = isSelected ? "#ff4d4f" : isImpacted ? "#fa8c16" : "#1677ff";
      return {
        data: {
          id: node.id,
          label: `${node.name} (${node.type})`,
          color,
          opacity,
        },
      };
    });

    const edgeElements = snapshot.graph.edges.map((edge) => {
      const sourceImpacted = impactedIds?.has(edge.fromId) ?? false;
      const targetImpacted = impactedIds?.has(edge.toId) ?? false;
      const opacity =
        hasImpact && !(sourceImpacted && targetImpacted) ? 0.15 : 0.8;
      const color = sourceImpacted && targetImpacted ? "#fa8c16" : "#91caff";
      return {
        data: {
          id: edge.id,
          source: edge.fromId,
          target: edge.toId,
          color,
          opacity,
        },
      };
    });

    cyRef.current?.destroy();
    cyRef.current = cytoscape({
      container,
      elements: [...nodeElements, ...edgeElements],
      layout: {
        name: "breadthfirst",
        directed: true,
        padding: 24,
        roots: selectedId ? `#${selectedId}` : undefined,
      } as any,
      style: [
        {
          selector: "node",
          style: {
            label: "data(label)",
            "text-wrap": "wrap",
            "text-max-width": "140px",
            "font-size": 10,
            "background-color": "data(color)",
            color: "#ffffff",
            opacity: "data(opacity)" as any,
            width: 44,
            height: 44,
          },
        },
        {
          selector: "edge",
          style: {
            width: 2,
            "line-color": "data(color)",
            "target-arrow-color": "data(color)",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            opacity: "data(opacity)" as any,
          },
        },
      ],
      userZoomingEnabled: true,
      userPanningEnabled: true,
      autoungrabify: true,
      autounselectify: true,
      boxSelectionEnabled: false,
    });

    cyRef.current.fit(undefined, 24);

    return () => {
      cyRef.current?.destroy();
      cyRef.current = null;
    };
  }, [snapshot, selectedId, impactedIds]);

  return (
    <div
      ref={containerRef}
      style={{
        height: 460,
        border: "1px solid var(--ant-color-border)",
        borderRadius: 6,
      }}
    />
  );
};

const ImpactAnalysisTab: React.FC = () => {
  const { eaRepository } = useEaRepository();

  const [section, setSection] = React.useState<ImpactAnalysisSectionKey>(
    DEFAULT_IMPACT_ANALYSIS_SECTION,
  );
  const [fragilityDrawer, setFragilityDrawer] =
    React.useState<ImpactSystemMetrics | null>(null);
  const [simulationMode, setSimulationMode] =
    React.useState<SimulationMode>("outbound");
  const [explorerMode, setExplorerMode] =
    React.useState<SimulationMode>("full");
  const [showExplorerIndicators, setShowExplorerIndicators] =
    React.useState(true);
  const [longChainThreshold, setLongChainThreshold] = React.useState(4);
  const [overviewRiskFilter, setOverviewRiskFilter] = React.useState<
    RiskLevel | "All"
  >("All");
  const [overviewDepthFilter, setOverviewDepthFilter] = React.useState<
    number | null
  >(null);
  const [overviewSystemFilter, setOverviewSystemFilter] = React.useState<
    string | null
  >(null);
  const [warningDrawer, setWarningDrawer] = React.useState<{
    key: string;
    label: string;
    systemIds: string[];
  } | null>(null);
  const [heatDrawerSystem, setHeatDrawerSystem] =
    React.useState<DashboardSystemMetrics | null>(null);

  const snapshot = React.useMemo(
    () => (eaRepository ? getImpactAnalysisSnapshot(eaRepository) : null),
    [eaRepository],
  );

  const [selectedSystemId, setSelectedSystemId] = React.useState<string>("");

  React.useEffect(() => {
    if (!snapshot) return;
    if (
      selectedSystemId &&
      snapshot.graph.nodes.some((node) => node.id === selectedSystemId)
    )
      return;
    setSelectedSystemId(
      snapshot.topImpactfulSystems[0]?.systemId ??
        snapshot.graph.nodes[0]?.id ??
        "",
    );
  }, [snapshot, selectedSystemId]);

  React.useEffect(() => {
    const onSectionChange = (event: Event) => {
      const customEvent = event as CustomEvent<{
        section?: ImpactAnalysisSectionKey;
      }>;
      const nextSection = customEvent.detail?.section;
      if (!nextSection) return;
      setSection(nextSection);
    };

    window.addEventListener(
      IMPACT_ANALYSIS_SECTION_EVENT,
      onSectionChange as EventListener,
    );
    return () =>
      window.removeEventListener(
        IMPACT_ANALYSIS_SECTION_EVENT,
        onSectionChange as EventListener,
      );
  }, []);

  const simulationResult = React.useMemo<ImpactSimulationResult | null>(() => {
    if (!snapshot || !selectedSystemId) return null;
    return simulateImpact(snapshot, selectedSystemId, simulationMode);
  }, [snapshot, selectedSystemId, simulationMode]);

  const explorerResult = React.useMemo<ImpactSimulationResult | null>(() => {
    if (!snapshot || !selectedSystemId) return null;
    return simulateImpact(snapshot, selectedSystemId, explorerMode);
  }, [snapshot, selectedSystemId, explorerMode]);

  const systemOptions = React.useMemo(
    () =>
      (snapshot?.systems ?? []).map((system) => ({
        value: system.systemId,
        label: `${system.systemName} (${system.systemType})`,
      })),
    [snapshot],
  );

  const fragilityColumns = React.useMemo<ProColumns<ImpactSystemMetrics>[]>(
    () => [
      { title: "System Name", dataIndex: "systemName" },
      { title: "Impact Score", dataIndex: "impactScore", width: 120 },
      {
        title: "Inbound Dependencies",
        dataIndex: "inboundDependencies",
        width: 170,
      },
      {
        title: "Outbound Dependencies",
        dataIndex: "outboundDependencies",
        width: 180,
      },
      { title: "Dependency Depth", dataIndex: "dependencyDepth", width: 140 },
      {
        title: "Redundancy Status",
        dataIndex: "redundancyStatus",
        width: 150,
        render: (_, row) =>
          row.redundancyStatus === "Single Path" ? (
            <Badge status="error" text="Single Path" />
          ) : (
            <Badge status="success" text="Redundant" />
          ),
      },
    ],
    [],
  );

  const exportImpactReport = React.useCallback(() => {
    if (!snapshot || !simulationResult) return;

    const csvRows = [
      "SystemId,SystemName,Impacted,ImpactScore,DependencyDepth",
      ...snapshot.systems.map((system) => {
        const impacted = simulationResult.affectedIds.has(system.systemId)
          ? "Yes"
          : "No";
        return [
          system.systemId,
          JSON.stringify(system.systemName),
          impacted,
          String(system.impactScore),
          String(system.dependencyDepth),
        ].join(",");
      }),
    ];

    const blob = new Blob([csvRows.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `impact-report-${simulationResult.rootId}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);

    Modal.success({
      title: "Impact report exported",
      content: "CSV export completed for the current simulation scope.",
    });
  }, [simulationResult, snapshot]);

  // Move hooks before the early return to comply with React rules
  const heatDrawerSimulation = React.useMemo(() => {
    if (!heatDrawerSystem || !snapshot) return null;
    return simulateImpact(snapshot, heatDrawerSystem.systemId, "outbound");
  }, [snapshot, heatDrawerSystem]);

  const warningImpactedIds = React.useMemo(
    () => new Set(warningDrawer?.systemIds ?? []),
    [warningDrawer],
  );

  const openSimulationFromSystem = React.useCallback((systemId: string) => {
    setSelectedSystemId(systemId);
    setSection("simulation");
  }, []);

  if (!snapshot) {
    return (
      <PageContainer title="Impact Analysis Mode" ghost>
        <Empty description="Load a repository to run dependency-based impact analysis." />
      </PageContainer>
    );
  }

  const RISK_TAG_COLORS: Record<RiskLevel, string> = {
    Critical: "red",
    High: "volcano",
    Medium: "gold",
    Low: "green",
  };

  const concentrationData = snapshot.dashboard.top10ImpactfulSystems
    .slice(0, 8)
    .map((item) => ({
      system:
        item.systemName.length > 14
          ? `${item.systemName.slice(0, 12)}…`
          : item.systemName,
      systemId: item.systemId,
      impact: item.impactScore,
      reachPercent: item.reachPercent,
      depth: item.dependencyDepth,
    }));

  const blastRadiusData = snapshot.dashboard.blastRadiusDistribution.map(
    (item) => ({
      severity: item.severity,
      value: item.count,
      percentage: item.percentage,
    }),
  );

  const depthData = snapshot.dashboard.depthDistribution.map((item) => ({
    depthLabel: `D${item.depth}`,
    depth: item.depth,
    systems: item.count,
    zone: item.depth >= 4 ? "Deep" : "Normal",
  }));

  const filteredHeatTableData = snapshot.dashboard.riskSystems
    .filter((item) =>
      overviewRiskFilter === "All"
        ? true
        : item.riskLevel === overviewRiskFilter,
    )
    .filter((item) =>
      overviewDepthFilter === null
        ? true
        : item.dependencyDepth === overviewDepthFilter,
    )
    .filter((item) =>
      overviewSystemFilter === null
        ? true
        : item.systemId === overviewSystemFilter,
    )
    .slice(0, 8);

  const overviewContent = (
    <Space
      direction="vertical"
      size={8}
      style={{
        width: "100%",
        background: "#eef2f6",
        padding: "0 10px 10px 10px",
        borderRadius: 6,
        boxSizing: "border-box",
        overflowX: "hidden",
        display: "flex",
      }}
    >
      <ProCard
        ghost
        gutter={[12, 12]}
        wrap
        title={
          <span style={{ fontSize: 14, fontWeight: 600, color: "#1f2937" }}>
            Health Strip
          </span>
        }
        style={{
          background: "#fff",
          border: "1px solid #d6dde6",
          borderRadius: 6,
          boxShadow: "0 1px 2px rgba(15, 23, 42, 0.03)",
          marginBottom: 12,
          overflowX: "hidden",
        }}
        headStyle={{ borderBottom: "1px solid #d6dde6" }}
        bodyStyle={{ padding: 10 }}
      >
        <ProCard colSpan={{ xs: 24, sm: 12, lg: 4 }}>
          <Card
            size="small"
            bordered
            hoverable
            style={{
              borderColor: "#d0d7e2",
              borderRadius: 6,
              boxShadow: "0 1px 2px rgba(15,23,42,0.02)",
            }}
            styles={{ body: { padding: 6 } }}
          >
            <Statistic
              title={
                <>
                  <DashboardOutlined /> Stability
                </>
              }
              value={snapshot.dashboard.stabilityScore}
              suffix="%"
              styles={{ content: { fontSize: 20, fontWeight: 700 } }}
            />
            <Progress
              type="circle"
              percent={snapshot.dashboard.stabilityScore}
              size={46}
              strokeColor={
                snapshot.dashboard.stabilityScore >= 75
                  ? "#52c41a"
                  : snapshot.dashboard.stabilityScore >= 50
                    ? "#faad14"
                    : "#ff4d4f"
              }
              showInfo={false}
            />
          </Card>
        </ProCard>
        <ProCard colSpan={{ xs: 24, sm: 12, lg: 4 }}>
          <Card
            size="small"
            bordered
            hoverable
            style={{
              borderColor: "#d0d7e2",
              borderRadius: 6,
              boxShadow: "0 1px 2px rgba(15,23,42,0.02)",
            }}
            styles={{ body: { padding: 6 } }}
          >
            <Statistic
              title={
                <>
                  <SafetyCertificateOutlined /> Concentration
                </>
              }
              value={snapshot.dashboard.concentrationRiskPercent}
              suffix="%"
              styles={{ content: { fontSize: 20, fontWeight: 700 } }}
            />
            <Progress
              percent={snapshot.dashboard.concentrationRiskPercent}
              size="small"
              strokeColor="#91caff"
              showInfo={false}
            />
          </Card>
        </ProCard>
        <ProCard colSpan={{ xs: 24, sm: 12, lg: 4 }}>
          <Card
            size="small"
            bordered
            hoverable
            style={{
              borderColor: "#d0d7e2",
              borderRadius: 6,
              boxShadow: "0 1px 2px rgba(15,23,42,0.02)",
            }}
            styles={{ body: { padding: 6 } }}
          >
            <Statistic
              title={
                <>
                  <ExclamationCircleOutlined /> Cascade
                </>
              }
              value={snapshot.dashboard.cascadeRiskIndex}
              suffix="idx"
              styles={{ content: { fontSize: 20, fontWeight: 700 } }}
            />
            <Badge
              status={
                snapshot.dashboard.cascadeRiskLevel === "High"
                  ? "error"
                  : snapshot.dashboard.cascadeRiskLevel === "Medium"
                    ? "warning"
                    : "success"
              }
              text={snapshot.dashboard.cascadeRiskLevel}
            />
          </Card>
        </ProCard>
        <ProCard colSpan={{ xs: 24, sm: 12, lg: 4 }}>
          <Card
            size="small"
            bordered
            hoverable
            style={{
              borderColor: "#d0d7e2",
              borderRadius: 6,
              boxShadow: "0 1px 2px rgba(15,23,42,0.02)",
            }}
            styles={{ body: { padding: 6 } }}
          >
            <Statistic
              title={
                <>
                  <LinkOutlined /> Chain
                </>
              }
              value={snapshot.overview.longestDependencyChain}
              suffix="L"
              styles={{ content: { fontSize: 20, fontWeight: 700 } }}
            />
          </Card>
        </ProCard>
        <ProCard colSpan={{ xs: 24, sm: 12, lg: 4 }}>
          <Card
            size="small"
            bordered
            hoverable
            style={{
              borderColor: "#d0d7e2",
              borderRadius: 6,
              boxShadow: "0 1px 2px rgba(15,23,42,0.02)",
            }}
            styles={{ body: { padding: 6 } }}
          >
            <Statistic
              title={
                <>
                  <WarningOutlined /> SPoF
                </>
              }
              value={snapshot.overview.singlePointsOfFailure}
              styles={{ content: { fontSize: 20, fontWeight: 700 } }}
            />
          </Card>
        </ProCard>
        <ProCard colSpan={{ xs: 24, sm: 12, lg: 4 }}>
          <Card
            size="small"
            bordered
            hoverable
            style={{
              borderColor: "#d0d7e2",
              borderRadius: 6,
              boxShadow: "0 1px 2px rgba(15,23,42,0.02)",
            }}
            styles={{ body: { padding: 6 } }}
          >
            <Statistic
              title={
                <>
                  <ApiOutlined /> Density
                </>
              }
              value={snapshot.dashboard.graphDensityRatio}
              suffix="r/s"
              precision={2}
              styles={{ content: { fontSize: 20, fontWeight: 700 } }}
            />
          </Card>
        </ProCard>
      </ProCard>

      <ProCard
        ghost
        gutter={[12, 12]}
        wrap
        title={
          <span style={{ fontSize: 14, fontWeight: 600, color: "#1f2937" }}>
            Visual Risk Intelligence
          </span>
        }
        style={{
          background: "#fff",
          border: "1px solid #d6dde6",
          borderRadius: 6,
          boxShadow: "0 1px 2px rgba(15, 23, 42, 0.03)",
          marginBottom: 12,
          overflowX: "hidden",
        }}
        headStyle={{ borderBottom: "1px solid #d6dde6" }}
        bodyStyle={{ padding: 10 }}
      >
        <ProCard
          colSpan={{ xs: 24, lg: 8 }}
          title="Concentration"
          bordered
          style={{
            borderColor: "#d0d7e2",
            borderRadius: 6,
            boxShadow: "0 1px 2px rgba(15,23,42,0.02)",
          }}
        >
          <SafeChart
            Chart={Column}
            label="Concentration"
            props={{
              data: concentrationData,
              xField: "system",
              yField: "impact",
              axis: { x: { labelAutoHide: true }, y: { title: false } },
              style: { fill: "#91caff", radiusTopLeft: 4, radiusTopRight: 4 },
              tooltip: {
                title: "system",
                items: [
                  { field: "impact", name: "Impact" },
                  { field: "reachPercent", name: "Reach %" },
                  { field: "depth", name: "Depth" },
                ],
              },
              onReady: (plot: any) => {
                plot.on("element:click", (evt: any) => {
                  const datum = evt?.data?.data;
                  if (datum?.systemId) setOverviewSystemFilter(datum.systemId);
                });
              },
              height: 140,
              autoFit: true,
            }}
          />
        </ProCard>

        <ProCard
          colSpan={{ xs: 24, lg: 8 }}
          title="Blast Radius"
          bordered
          style={{
            borderColor: "#d0d7e2",
            borderRadius: 6,
            boxShadow: "0 1px 2px rgba(15,23,42,0.02)",
          }}
        >
          <SafeChart
            Chart={Pie}
            label="Blast Radius"
            props={{
              data: blastRadiusData,
              angleField: "value",
              colorField: "severity",
              innerRadius: 0.6,
              style: {
                fill: ({ severity }: { severity: RiskLevel }) =>
                  severity === "Critical"
                    ? "#ff4d4f"
                    : severity === "High"
                      ? "#ff9c6e"
                      : severity === "Medium"
                        ? "#ffd666"
                        : "#95de64",
              },
              tooltip: {
                title: "severity",
                items: [
                  { field: "value", name: "Systems" },
                  { field: "percentage", name: "Share %" },
                ],
              },
              onReady: (plot: any) => {
                plot.on("element:click", (evt: any) => {
                  const datum = evt?.data?.data;
                  if (datum?.severity) {
                    setOverviewRiskFilter(datum.severity);
                    setOverviewSystemFilter(null);
                  }
                });
              },
              height: 140,
              autoFit: true,
            }}
          />
        </ProCard>

        <ProCard
          colSpan={{ xs: 24, lg: 8 }}
          title="Depth"
          bordered
          style={{
            borderColor: "#d0d7e2",
            borderRadius: 6,
            boxShadow: "0 1px 2px rgba(15,23,42,0.02)",
          }}
        >
          <SafeChart
            Chart={Area}
            label="Depth"
            props={{
              data: depthData,
              xField: "depthLabel",
              yField: "systems",
              colorField: "zone",
              style: {
                fill: ({ zone }: { zone: string }) =>
                  zone === "Deep"
                    ? "rgba(255,77,79,0.25)"
                    : "rgba(145,202,255,0.25)",
                stroke: ({ zone }: { zone: string }) =>
                  zone === "Deep" ? "#ff4d4f" : "#1677ff",
                lineWidth: 2,
              },
              tooltip: {
                title: "depthLabel",
                items: [{ field: "systems", name: "Systems" }],
              },
              onReady: (plot: any) => {
                plot.on("element:click", (evt: any) => {
                  const datum = evt?.data?.data;
                  if (typeof datum?.depth === "number") {
                    setOverviewDepthFilter(datum.depth);
                    setOverviewSystemFilter(null);
                  }
                });
              },
              height: 140,
              autoFit: true,
            }}
          />
        </ProCard>
      </ProCard>

      <ProCard
        ghost
        split="vertical"
        gutter={12}
        title={
          <span style={{ fontSize: 14, fontWeight: 600, color: "#1f2937" }}>
            Structural Warnings + Impact Heat
          </span>
        }
        style={{
          background: "#fff",
          border: "1px solid #d6dde6",
          borderRadius: 6,
          boxShadow: "0 1px 2px rgba(15, 23, 42, 0.03)",
          marginBottom: 12,
          overflowX: "hidden",
        }}
        headStyle={{ borderBottom: "1px solid #d6dde6" }}
        bodyStyle={{ padding: 10 }}
      >
        <ProCard
          colSpan="40%"
          title="Warnings"
          bordered
          style={{
            borderColor: "#d0d7e2",
            borderRadius: 6,
            boxShadow: "0 1px 2px rgba(15,23,42,0.02)",
          }}
        >
          <Card
            size="small"
            bordered
            style={{
              borderColor: "#d6dde6",
              background: "#f2f6fb",
              borderRadius: 6,
            }}
            styles={{ body: { padding: 8 } }}
          >
            <Space size={[8, 8]} wrap>
              {snapshot.dashboard.warningPanel.map((warning) => (
                <Tag
                  key={warning.key}
                  color={
                    warning.severity === "error"
                      ? "red"
                      : warning.severity === "warning"
                        ? "gold"
                        : warning.severity === "processing"
                          ? "blue"
                          : "green"
                  }
                  onClick={() =>
                    setWarningDrawer({
                      key: warning.key,
                      label: warning.label,
                      systemIds: warning.systemIds,
                    })
                  }
                  style={{ cursor: "pointer" }}
                >
                  {warning.label} {warning.count}
                </Tag>
              ))}
            </Space>
          </Card>
          <div style={{ marginTop: 6 }}>
            <Badge status="processing" text={`Filter: ${overviewRiskFilter}`} />
            <Badge
              style={{ marginLeft: 8 }}
              status="processing"
              text={`Depth: ${overviewDepthFilter === null ? "All" : `D${overviewDepthFilter}`}`}
            />
            <Badge
              style={{ marginLeft: 8 }}
              status="processing"
              text={`System: ${overviewSystemFilter ? (concentrationData.find((item) => item.systemId === overviewSystemFilter)?.system ?? "-") : "All"}`}
            />
            <Button
              size="small"
              type="link"
              onClick={() => {
                setOverviewRiskFilter("All");
                setOverviewDepthFilter(null);
                setOverviewSystemFilter(null);
              }}
            >
              Reset
            </Button>
          </div>
        </ProCard>

        <ProCard
          colSpan="60%"
          title="Impact Heat"
          bordered
          style={{
            borderColor: "#d0d7e2",
            borderRadius: 6,
            boxShadow: "0 1px 2px rgba(15,23,42,0.02)",
          }}
        >
          <Card
            size="small"
            bordered
            style={{ borderColor: "#d0d7e2", borderRadius: 6 }}
            styles={{ body: { padding: 4 } }}
          >
            <ProTable<DashboardSystemMetrics>
              rowKey="systemId"
              size="small"
              search={false}
              options={false}
              pagination={false}
              tableStyle={{ background: "#fff" }}
              dataSource={filteredHeatTableData}
              columns={[
                {
                  title: "System",
                  dataIndex: "systemName",
                  onHeaderCell: () => ({ style: { background: "#eef3f8" } }),
                  ellipsis: true,
                  onCell: () => ({
                    style: { paddingTop: 6, paddingBottom: 6 },
                  }),
                  render: (_, row) => (
                    <Button
                      type="link"
                      size="small"
                      style={{ paddingInline: 0 }}
                      onClick={(event) => {
                        event.stopPropagation();
                        openSimulationFromSystem(row.systemId);
                      }}
                    >
                      {row.systemName}
                    </Button>
                  ),
                },
                {
                  title: "Impact",
                  dataIndex: "impactScore",
                  width: 80,
                  onHeaderCell: () => ({ style: { background: "#eef3f8" } }),
                  onCell: () => ({
                    style: { paddingTop: 6, paddingBottom: 6 },
                  }),
                },
                {
                  title: "Reach %",
                  dataIndex: "reachPercent",
                  width: 80,
                  onHeaderCell: () => ({ style: { background: "#eef3f8" } }),
                  onCell: () => ({
                    style: { paddingTop: 6, paddingBottom: 6 },
                  }),
                },
                {
                  title: "Depth",
                  dataIndex: "dependencyDepth",
                  width: 70,
                  onHeaderCell: () => ({ style: { background: "#eef3f8" } }),
                  onCell: () => ({
                    style: { paddingTop: 6, paddingBottom: 6 },
                  }),
                },
                {
                  title: "Risk",
                  dataIndex: "riskLevel",
                  width: 90,
                  onHeaderCell: () => ({ style: { background: "#eef3f8" } }),
                  onCell: () => ({
                    style: { paddingTop: 6, paddingBottom: 6 },
                  }),
                  render: (_, row) => (
                    <Tag color={RISK_TAG_COLORS[row.riskLevel]}>
                      {row.riskLevel}
                    </Tag>
                  ),
                },
              ]}
              onRow={(record) => ({
                onClick: () => {
                  setHeatDrawerSystem(record);
                },
                style: {
                  cursor: "pointer",
                  transition: "background-color 0.2s",
                },
                onMouseEnter: (event) => {
                  event.currentTarget.style.backgroundColor = "#f8fafc";
                },
                onMouseLeave: (event) => {
                  event.currentTarget.style.backgroundColor = "";
                },
              })}
            />
          </Card>
        </ProCard>
      </ProCard>

      <Drawer
        title={warningDrawer ? `Warning ${warningDrawer.label}` : "Warning"}
        width={560}
        open={Boolean(warningDrawer)}
        onClose={() => setWarningDrawer(null)}
      >
        {warningDrawer ? (
          <ReadOnlyImpactCanvas
            snapshot={snapshot}
            selectedId={warningDrawer.systemIds[0]}
            impactedIds={warningImpactedIds}
          />
        ) : null}
      </Drawer>

      <Drawer
        title={heatDrawerSystem ? heatDrawerSystem.systemName : "System"}
        width={620}
        open={Boolean(heatDrawerSystem)}
        onClose={() => setHeatDrawerSystem(null)}
        extra={
          heatDrawerSystem ? (
            <Button
              size="small"
              type="primary"
              onClick={() =>
                openSimulationFromSystem(heatDrawerSystem.systemId)
              }
            >
              Simulate
            </Button>
          ) : null
        }
      >
        {heatDrawerSystem ? (
          <Tabs
            size="small"
            items={[
              {
                key: "graph",
                label: "Graph",
                children: (
                  <ReadOnlyImpactCanvas
                    snapshot={snapshot}
                    selectedId={heatDrawerSystem.systemId}
                    impactedIds={heatDrawerSimulation?.affectedIds}
                  />
                ),
              },
              {
                key: "downstream",
                label: "Downstream",
                children: (
                  <ProTable<{ id: string; name: string }>
                    rowKey="id"
                    size="small"
                    search={false}
                    options={false}
                    pagination={false}
                    dataSource={snapshot.graph.nodes
                      .filter(
                        (node) =>
                          heatDrawerSimulation?.affectedIds.has(node.id) &&
                          node.id !== heatDrawerSystem.systemId,
                      )
                      .slice(0, 20)
                      .map((node) => ({ id: node.id, name: node.name }))}
                    columns={[{ title: "System", dataIndex: "name" }]}
                  />
                ),
              },
              {
                key: "depth",
                label: "Chain",
                children: (
                  <SafeChart
                    Chart={Bar}
                    label="Chain"
                    props={{
                      data: [
                        {
                          metric: "Depth",
                          value: heatDrawerSystem.dependencyDepth,
                        },
                        {
                          metric: "Reach %",
                          value: heatDrawerSystem.reachPercent,
                        },
                        {
                          metric: "Central %",
                          value: heatDrawerSystem.centralizationPercent,
                        },
                      ],
                      xField: "metric",
                      yField: "value",
                      style: { fill: "#b7eb8f" },
                      axis: { y: { title: false } },
                      height: 150,
                      autoFit: true,
                    }}
                  />
                ),
              },
            ]}
          />
        ) : null}
      </Drawer>
    </Space>
  );

  const fragilityContent = (
    <>
      <ProTable<ImpactSystemMetrics>
        rowKey="systemId"
        search={false}
        columns={fragilityColumns}
        dataSource={[...snapshot.systems].sort(
          (a, b) => b.impactScore - a.impactScore,
        )}
        onRow={(record) => ({
          onClick: () => setFragilityDrawer(record),
        })}
      />
      <Drawer
        title="Impact Breakdown"
        width={460}
        open={Boolean(fragilityDrawer)}
        onClose={() => setFragilityDrawer(null)}
      >
        {fragilityDrawer ? (
          <Descriptions bordered size="small" column={1}>
            <Descriptions.Item label="System Name">
              {fragilityDrawer.systemName}
            </Descriptions.Item>
            <Descriptions.Item label="Impact Score">
              {fragilityDrawer.impactScore}
            </Descriptions.Item>
            <Descriptions.Item label="Inbound Dependencies">
              {fragilityDrawer.inboundDependencies}
            </Descriptions.Item>
            <Descriptions.Item label="Outbound Dependencies">
              {fragilityDrawer.outboundDependencies}
            </Descriptions.Item>
            <Descriptions.Item label="Dependency Depth">
              {fragilityDrawer.dependencyDepth}
            </Descriptions.Item>
            <Descriptions.Item label="Downstream Reach">
              {fragilityDrawer.downstreamReach}
            </Descriptions.Item>
            <Descriptions.Item label="Redundancy Status">
              {fragilityDrawer.redundancyStatus}
            </Descriptions.Item>
          </Descriptions>
        ) : null}
      </Drawer>
    </>
  );

  const simulationContent = (
    <Row gutter={12}>
      <Col xs={24} md={6}>
        <ProCard title="Select System">
          <Select
            style={{ width: "100%" }}
            value={selectedSystemId}
            options={systemOptions}
            onChange={setSelectedSystemId}
            showSearch
            optionFilterProp="label"
          />
          <Radio.Group
            style={{ marginTop: 12 }}
            value={simulationMode}
            onChange={(event) => setSimulationMode(event.target.value)}
            options={[
              { label: "Outbound", value: "outbound" },
              { label: "Inbound", value: "inbound" },
              { label: "Full Chain", value: "full" },
            ]}
          />
        </ProCard>
      </Col>

      <Col xs={24} md={12}>
        <ProCard title="Graph Canvas">
          <ReadOnlyImpactCanvas
            snapshot={snapshot}
            selectedId={selectedSystemId}
            impactedIds={simulationResult?.affectedIds}
          />
        </ProCard>
      </Col>

      <Col xs={24} md={6}>
        <ProCard title="Summary Panel">
          <Space direction="vertical" style={{ width: "100%" }}>
            <Statistic
              title="Total systems affected"
              value={Math.max(0, (simulationResult?.affectedIds.size ?? 1) - 1)}
            />
            <Statistic
              title="Maximum depth"
              value={simulationResult?.maxDepth ?? 0}
            />
            <Statistic
              title="Cascading level"
              value={simulationResult?.cascadingLevel ?? 0}
            />
            <div>
              Severity{" "}
              <Tag
                color={
                  simulationResult?.severity === "High"
                    ? "red"
                    : simulationResult?.severity === "Medium"
                      ? "orange"
                      : "green"
                }
              >
                {simulationResult?.severity ?? "Low"}
              </Tag>
            </div>
            <Button type="primary" onClick={exportImpactReport}>
              Export Impact Report
            </Button>
          </Space>
        </ProCard>
      </Col>
    </Row>
  );

  const dependencyExplorerContent = (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <ProCard>
        <Space wrap>
          <Select
            style={{ minWidth: 340 }}
            value={selectedSystemId}
            options={systemOptions}
            onChange={setSelectedSystemId}
            showSearch
            optionFilterProp="label"
          />
          <Radio.Group
            value={explorerMode}
            onChange={(event) => setExplorerMode(event.target.value)}
            options={[
              { label: "Inbound only", value: "inbound" },
              { label: "Outbound only", value: "outbound" },
              { label: "Full chain", value: "full" },
            ]}
          />
          <Switch
            checked={showExplorerIndicators}
            onChange={setShowExplorerIndicators}
            checkedChildren="Indicators"
            unCheckedChildren="Indicators"
          />
        </Space>
      </ProCard>

      {showExplorerIndicators ? (
        <ProCard>
          <Space wrap>
            <Badge
              status={snapshot.cycleNodeCount > 0 ? "error" : "success"}
              text={`Circular dependencies: ${snapshot.cycleNodeCount}`}
            />
            <Badge
              status={
                snapshot.systems.filter(
                  (s) => s.dependencyDepth >= longChainThreshold,
                ).length > 0
                  ? "warning"
                  : "success"
              }
              text={`Long chains (>=${longChainThreshold}): ${snapshot.systems.filter((s) => s.dependencyDepth >= longChainThreshold).length}`}
            />
            <Badge
              status={snapshot.isolatedNodeCount > 0 ? "processing" : "default"}
              text={`Isolated nodes: ${snapshot.isolatedNodeCount}`}
            />
          </Space>
        </ProCard>
      ) : null}

      <ProCard title="Dependency Explorer (Read-only)">
        <ReadOnlyImpactCanvas
          snapshot={snapshot}
          selectedId={selectedSystemId}
          impactedIds={explorerResult?.affectedIds}
        />
      </ProCard>
    </Space>
  );

  const structuralHealthContent = (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <ProCard split="vertical">
        <ProCard colSpan="25%">
          <Statistic
            title="Orphan systems"
            value={snapshot.orphanSystems.length}
          />
        </ProCard>
        <ProCard colSpan="25%">
          <Statistic
            title="Zero inbound/outbound"
            value={
              snapshot.systems.filter(
                (s) =>
                  s.inboundDependencies === 0 || s.outboundDependencies === 0,
              ).length
            }
          />
        </ProCard>
        <ProCard colSpan="25%">
          <Statistic
            title="High centrality systems"
            value={snapshot.highCentralitySystems.length}
          />
        </ProCard>
        <ProCard colSpan="25%">
          <Statistic
            title="Metadata gaps"
            value={snapshot.metadataGaps.length}
          />
        </ProCard>
      </ProCard>

      <ProCard title="Structural Health Details">
        <ProTable<ImpactSystemMetrics>
          rowKey="systemId"
          search={false}
          columns={[
            { title: "System Name", dataIndex: "systemName" },
            { title: "Inbound", dataIndex: "inboundDependencies", width: 100 },
            {
              title: "Outbound",
              dataIndex: "outboundDependencies",
              width: 110,
            },
            { title: "Impact Score", dataIndex: "impactScore", width: 120 },
            {
              title: "Health Tags",
              render: (_, row) => (
                <Space>
                  {row.inboundDependencies === 0 &&
                  row.outboundDependencies === 0 ? (
                    <Tag color="blue">Orphan</Tag>
                  ) : null}
                  {row.inboundDependencies === 0 ||
                  row.outboundDependencies === 0 ? (
                    <Tag color="gold">Zero in/out</Tag>
                  ) : null}
                  {snapshot.highCentralitySystems.some(
                    (item) => item.systemId === row.systemId,
                  ) ? (
                    <Tag color="purple">High centrality</Tag>
                  ) : null}
                </Space>
              ),
            },
          ]}
          dataSource={snapshot.systems}
        />
      </ProCard>
    </Space>
  );

  const settingsContent = (
    <ProCard title="Analysis Settings">
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        <Typography.Text>
          Cache key (repository fingerprint): {snapshot.fingerprint}
        </Typography.Text>
        <Space>
          <Typography.Text>Long chain threshold</Typography.Text>
          <Select
            style={{ width: 120 }}
            value={longChainThreshold}
            options={[3, 4, 5, 6, 8].map((value) => ({
              value,
              label: `${value}`,
            }))}
            onChange={setLongChainThreshold}
          />
        </Space>
        <Typography.Text type="secondary">
          Analysis is read-only, dependency-based, and computed in-memory from
          EaRepository.
        </Typography.Text>
      </Space>
    </ProCard>
  );

  const contentBySection: Record<ImpactAnalysisSectionKey, React.ReactNode> = {
    overview: overviewContent,
    fragility: fragilityContent,
    simulation: simulationContent,
    explorer: dependencyExplorerContent,
    health: structuralHealthContent,
    settings: settingsContent,
  };

  return (
    <PageContainer
      title="Impact Analysis Mode"
      ghost
      style={{ paddingBlockStart: 0, paddingTop: 0, marginTop: -6 }}
      header={{
        style: {
          paddingBlockStart: 0,
          paddingTop: 0,
          paddingBlockEnd: 0,
          paddingBottom: 0,
          minHeight: 0,
          marginBottom: 0,
        },
      }}
      childrenContentStyle={{
        marginBlockStart: 0,
        marginTop: 0,
        paddingBlockStart: 0,
        paddingTop: 0,
        overflowX: "hidden",
      }}
    >
      {contentBySection[section]}
    </PageContainer>
  );
};

export default ImpactAnalysisTab;
