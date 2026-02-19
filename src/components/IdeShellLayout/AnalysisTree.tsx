import {
  AlertOutlined,
  ApartmentOutlined,
  BarChartOutlined,
  ClusterOutlined,
  DashboardOutlined,
  SettingOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import React from "react";
import {
  DEFAULT_IMPACT_ANALYSIS_SECTION,
  dispatchImpactAnalysisSection,
  type ImpactAnalysisSectionKey,
} from "@/analysis/impactAnalysisMode";
import { useIdeShell } from "./index";
import NavigationSidebar, {
  type NavigationSidebarGroup,
} from "./NavigationSidebar";
import { useIdeSelection } from "@/ide/IdeSelectionContext";

const MENU_TO_SECTION: Record<string, ImpactAnalysisSectionKey> = {
  "analysis:overview": "overview",
  "analysis:fragility": "fragility",
  "analysis:simulation": "simulation",
  "analysis:explorer": "explorer",
  "analysis:health": "health",
  "analysis:settings": "settings",
};

const ANALYSIS_ITEMS: Array<{
  key: string;
  label: string;
  icon: React.ReactNode;
}> = [
  { key: "analysis:overview", label: "Overview", icon: <BarChartOutlined /> },
  { key: "analysis:fragility", label: "Fragility", icon: <AlertOutlined /> },
  {
    key: "analysis:simulation",
    label: "Impact Simulation",
    icon: <ThunderboltOutlined />,
  },
  {
    key: "analysis:explorer",
    label: "Dependency Explorer",
    icon: <ClusterOutlined />,
  },
  {
    key: "analysis:health",
    label: "Structural Health",
    icon: <DashboardOutlined />,
  },
  { key: "analysis:settings", label: "Settings", icon: <SettingOutlined /> },
];

const AnalysisTree: React.FC = () => {
  const { openWorkspaceTab, openRouteTab } = useIdeShell();
  const { setSelection } = useIdeSelection();
  const [selectedKey, setSelectedKey] = React.useState<string>(
    `analysis:${DEFAULT_IMPACT_ANALYSIS_SECTION}`,
  );

  const groups: NavigationSidebarGroup[] = React.useMemo(
    () => [
      {
        key: "analysis-navigation",
        items: [
          {
            key: "analysis-root",
            label: "Analysis",
            level: 1,
            icon: <ApartmentOutlined />,
          },
          {
            key: "analysis-folder:impact",
            label: "Impact Analysis",
            level: 2,
            icon: <ApartmentOutlined />,
          },
          ...ANALYSIS_ITEMS.map((item) => ({
            key: item.key,
            label: item.label,
            icon: item.icon,
            level: 3 as const,
            selected: selectedKey === item.key,
            onSelect: () => {
              const section = MENU_TO_SECTION[item.key];
              if (!section) return;

              setSelectedKey(item.key);
              setSelection({ kind: 'analysis', keys: [item.key] });

              if (item.key === 'analysis:overview') {
                openRouteTab('/analysis/overview');
                return;
              }

              openWorkspaceTab({ type: 'analysis', kind: 'impact' });
              dispatchImpactAnalysisSection(section);
            },
          })),
        ],
      },
    ],
    [openWorkspaceTab, openRouteTab, selectedKey, setSelection],
  );

  return <NavigationSidebar ariaLabel="Analysis navigation" groups={groups} />;
};

export default AnalysisTree;
