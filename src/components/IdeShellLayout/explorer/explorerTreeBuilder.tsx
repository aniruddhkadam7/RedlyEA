/**
 * Explorer Tree Builder — Dynamically builds the enterprise-grade DataNode[]
 * tree from live repository state, metamodel, views, baselines, and roadmaps.
 *
 * DESIGN:
 * - All component collections are derived from OBJECT_TYPE_DEFINITIONS
 * - Relationship categories come from RELATIONSHIP_TYPE_DEFINITIONS
 * - Tree children are lazily assembled via useMemo on repository changes
 * - No hardcoded element types — everything flows from the metamodel
 */

import { FolderOutlined } from "@ant-design/icons";
import type { DataNode as AntDataNode } from "antd/es/tree";
import React from "react";

type DataNode = AntDataNode & {
  data?: Record<string, unknown>;
  className?: string;
};

import type { ViewInstance } from "@/diagram-studio/viewpoints/ViewInstance";
import { ViewpointRegistry } from "@/diagram-studio/viewpoints/ViewpointRegistry";
import type {
  ObjectType,
  RelationshipType,
} from "@/pages/dependency-view/utils/eaMetaModel";
import {
  OBJECT_TYPE_DEFINITIONS,
  RELATIONSHIP_TYPE_DEFINITIONS,
} from "@/pages/dependency-view/utils/eaMetaModel";
import { isObjectTypeEnabledForFramework } from "@/repository/customFrameworkConfig";
import { isObjectTypeAllowedForReferenceFramework } from "@/repository/referenceFrameworkPolicy";
import type { EaRepositoryMetadata } from "@/repository/repositoryMetadata";

import type { Baseline } from "../../../../backend/baselines/Baseline";
import type { Plateau } from "../../../../backend/roadmap/Plateau";
import type { Roadmap } from "../../../../backend/roadmap/Roadmap";
import {
  EXPLORER_KEYS,
  getObjectTypesByCategory,
  getObjectTypesByMetamodelLayer,
  getRelationshipTypesByCategory,
  resolveArchitectureName,
} from "./explorerNodeRegistry";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isSoftDeleted = (
  attributes: Record<string, unknown> | null | undefined,
): boolean => {
  if ((attributes as any)?._deleted === true) return true;
  const modelingState = String((attributes as any)?.modelingState ?? "")
    .trim()
    .toUpperCase();
  return modelingState === "DRAFT";
};

const nameForObject = (obj: {
  id: string;
  attributes?: Record<string, unknown>;
}): string => {
  const raw = (obj.attributes as any)?.name;
  const name = typeof raw === "string" ? raw.trim() : "";
  return name || obj.id;
};

const titleForObjectType = (type: ObjectType): string => {
  // Derive display name from PascalCase → Title Case
  return type
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
};

const iconAsset = (src: string, key?: string): React.ReactNode => {
  const preferredSrc = src;
  const fallbackSrc = src.endsWith(".svg")
    ? src.replace(/\.svg$/i, ".png")
    : undefined;
  return React.createElement("img", {
    src: preferredSrc,
    alt: "",
    "aria-hidden": true,
    loading: "lazy",
    decoding: "async",
    onError: (event: any) => {
      if (!fallbackSrc || !event?.currentTarget) return;
      const current = event.currentTarget.src;
      if (current && !current.endsWith(fallbackSrc)) {
        event.currentTarget.src = fallbackSrc;
      }
    },
    className: `explorer-asset-icon${key ? ` explorer-asset-icon-${key}` : ""}`,
  });
};

const classForNodeKey = (key: string): string => {
  if (key.startsWith("section:metamodel"))
    return "explorer-node explorer-node-metamodel explorer-node-folder";
  if (key.includes(":connections"))
    return "explorer-node explorer-node-connection";
  if (key.includes(":catalogues"))
    return "explorer-node explorer-node-catalogue";
  if (key.includes(":matrices")) return "explorer-node explorer-node-matrix";
  if (key.includes(":diagrams")) return "explorer-node explorer-node-diagram";
  if (key.startsWith("section:framework-packages"))
    return "explorer-node explorer-node-framework explorer-node-folder";
  if (key.includes(":components"))
    return "explorer-node explorer-node-component explorer-node-folder";
  if (
    key.startsWith("ws:") ||
    key.startsWith("zone:") ||
    key.startsWith("section:") ||
    key.startsWith("arch:")
  ) {
    return "explorer-node explorer-node-folder";
  }
  return "explorer-node";
};

const folderIcon = iconAsset("/icons/explorer/folder.svg", "folder");
const componentIcon = iconAsset(
  "/icons/explorer/component-cluster.svg",
  "component",
);
const catalogueIcon = iconAsset(
  "/icons/explorer/catalogue-grid.svg",
  "catalogue",
);
const matrixIcon = iconAsset("/icons/explorer/matrix-grid.svg", "matrix");
const diagramIcon = iconAsset("/icons/explorer/diagram-node.svg", "diagram");
const connectionIcon = iconAsset(
  "/icons/explorer/connection-link.svg",
  "connection",
);
const frameworkIcon = iconAsset(
  "/icons/explorer/framework-triangle.svg",
  "framework",
);
const metamodelIcon = iconAsset(
  '/icons/explorer/metamodel-blueprint.svg',
  'metamodel',
);
const reportIcon = iconAsset('/icons/explorer/report.svg', 'report');
const settingsIcon = iconAsset(
  '/icons/explorer/settings.svg',
  'settings',
);
const reportIcon = iconAsset("/icons/explorer/report.svg", "report");
const settingsIcon = iconAsset("/icons/explorer/settings.svg", "settings");
const fallbackGenericIcon = React.createElement(FolderOutlined);

const iconForLayer = (layer: string): React.ReactNode => {
  switch (layer) {
    case "Business":
      return iconAsset(
        "/rendering/archimate-icons/business-role.svg",
        "business",
      );
    case "Application":
      return iconAsset(
        "/rendering/archimate-icons/application-component.svg",
        "application",
      );
    case "Technology":
      return iconAsset(
        "/rendering/archimate-icons/technology-node.svg",
        "technology",
      );
    case "Data":
      return iconAsset(
        "/rendering/archimate-icons/application-dataobject.svg",
        "data",
      );
    case "Implementation & Migration":
      return iconAsset(
        "/rendering/archimate-icons/implementation-workpackage.svg",
        "implementation",
      );
    case "Governance":
      return iconAsset(
        "/rendering/archimate-icons/motivation-goal.svg",
        "governance",
      );
    default:
      return fallbackGenericIcon;
  }
};

const iconForObjectType = (type: ObjectType): React.ReactNode => {
  const def = OBJECT_TYPE_DEFINITIONS[type];
  if (!def) return folderIcon;
  const normalized = type.toLowerCase();
  if (normalized.includes("enterprise"))
    return iconAsset(
      "/rendering/archimate-icons/business-actor.svg",
      "enterprise",
    );
  if (normalized.includes("capability"))
    return iconAsset(
      "/rendering/archimate-icons/strategy-capability.svg",
      "capability",
    );
  if (normalized.includes("valuestream"))
    return iconAsset(
      "/rendering/archimate-icons/strategy-valuestream.svg",
      "valuestream",
    );
  if (normalized.includes("process"))
    return iconAsset(
      "/rendering/archimate-icons/business-process.svg",
      "process",
    );
  if (normalized.includes("department"))
    return iconAsset(
      "/rendering/archimate-icons/business-role.svg",
      "department",
    );
  if (normalized.includes("application") && !normalized.includes("service"))
    return iconAsset(
      "/rendering/archimate-icons/application-component.svg",
      "application",
    );
  if (normalized.includes("service"))
    return iconAsset(
      "/rendering/archimate-icons/application-service.svg",
      "service",
    );
  if (normalized.includes("interface") || normalized.includes("api"))
    return iconAsset(
      "/rendering/archimate-icons/application-interface.svg",
      "interface",
    );
  if (normalized.includes("database") || normalized.includes("data"))
    return iconAsset(
      "/rendering/archimate-icons/application-dataobject.svg",
      "database",
    );
  if (normalized.includes("storage") || normalized.includes("artifact"))
    return iconAsset(
      "/rendering/archimate-icons/technology-artifact.svg",
      "storage",
    );
  if (normalized.includes("cloud"))
    return iconAsset(
      "/rendering/archimate-icons/technology-service.svg",
      "cloud",
    );
  if (normalized.includes("network") || normalized.includes("loadbalancer"))
    return iconAsset(
      "/rendering/archimate-icons/technology-communicationnetwork.svg",
      "network",
    );
  if (
    normalized.includes("node") ||
    normalized.includes("server") ||
    normalized.includes("compute") ||
    normalized.includes("vm") ||
    normalized.includes("container") ||
    normalized.includes("runtime")
  )
    return iconAsset("/rendering/archimate-icons/technology-node.svg", "node");
  if (
    normalized.includes("messagebroker") ||
    normalized.includes("integrationplatform")
  )
    return iconAsset(
      "/rendering/archimate-icons/application-interaction.svg",
      "integration",
    );
  if (normalized.includes("programme") || normalized.includes("project"))
    return iconAsset(
      "/rendering/archimate-icons/implementation-workpackage.svg",
      "project",
    );
  if (normalized.includes("principle"))
    return iconAsset(
      "/rendering/archimate-icons/motivation-principle.svg",
      "principle",
    );
  if (normalized.includes("standard"))
    return iconAsset(
      "/rendering/archimate-icons/motivation-constraint.svg",
      "standard",
    );
  if (normalized.includes("requirement"))
    return iconAsset(
      "/rendering/archimate-icons/motivation-requirement.svg",
      "requirement",
    );
  return iconForLayer(def.layer);
};

// ---------------------------------------------------------------------------
// Leaf node factories
// ---------------------------------------------------------------------------

function elementLeaves(
  objectsById: Map<
    string,
    { id: string; type: ObjectType; attributes: Record<string, unknown> }
  >,
  types: readonly ObjectType[],
): DataNode[] {
  const typeSet = new Set(types);
  const items = Array.from(objectsById.values()).filter(
    (o) => typeSet.has(o.type) && !isSoftDeleted(o.attributes),
  );
  items.sort(
    (a, b) =>
      nameForObject(a).localeCompare(nameForObject(b)) ||
      a.id.localeCompare(b.id),
  );
  return items.map((o) => ({
    key: EXPLORER_KEYS.element(o.id),
    title: nameForObject(o),
    icon: iconForObjectType(o.type),
    isLeaf: true,
    className: `explorer-node explorer-node-component explorer-node-element explorer-node-element-${String(o.type).toLowerCase()}`,
    data: { elementId: o.id, elementType: o.type },
  }));
}

function viewLeaf(v: ViewInstance): DataNode {
  const viewpoint = ViewpointRegistry.get(v.viewpointId);
  const label = viewpoint?.name ?? v.viewpointId;
  return {
    key: EXPLORER_KEYS.view(v.id),
    title: React.createElement(
      "span",
      null,
      v.name,
      " ",
      React.createElement(
        "span",
        { style: { color: "#8c8c8c" } },
        `(${label})`,
      ),
    ),
    icon: diagramIcon,
    isLeaf: true,
    className: "explorer-node explorer-node-diagram",
    data: { viewId: v.id },
  };
}

function baselineLeaf(b: Baseline): DataNode {
  return {
    key: EXPLORER_KEYS.baseline(b.id),
    title: b.name || b.id,
    icon: frameworkIcon,
    isLeaf: true,
    className: "explorer-node explorer-node-framework",
    data: { baselineId: b.id },
  };
}

function plateauLeaf(p: Plateau): DataNode {
  return {
    key: EXPLORER_KEYS.plateau(p.id),
    title: p.name,
    icon: frameworkIcon,
    isLeaf: true,
    className: "explorer-node explorer-node-framework",
    data: { plateauId: p.id },
  };
}

function roadmapLeaf(r: Roadmap): DataNode {
  return {
    key: EXPLORER_KEYS.roadmap(r.id),
    title: r.name,
    icon: frameworkIcon,
    isLeaf: true,
    className: "explorer-node explorer-node-framework",
    data: { roadmapId: r.id },
  };
}

function relationshipLeaf(
  rel: { id?: string; fromId: string; toId: string; type: string },
  objectsById: Map<string, any>,
): DataNode {
  const source = objectsById.get(rel.fromId);
  const target = objectsById.get(rel.toId);
  const sourceLabel = source ? nameForObject(source) : rel.fromId;
  const targetLabel = target ? nameForObject(target) : rel.toId;
  const id = rel.id ?? `${rel.fromId}-${rel.type}-${rel.toId}`;
  return {
    key: EXPLORER_KEYS.relationship(id),
    title: `${sourceLabel} → ${rel.type} → ${targetLabel}`,
    icon: connectionIcon,
    isLeaf: true,
    className: "explorer-node explorer-node-connection",
    data: { connectionType: rel.type },
  };
}

function collectionNode(
  key: string,
  title: string,
  icon: React.ReactNode,
  children: DataNode[],
  data?: Record<string, unknown>,
): DataNode {
  return {
    key,
    title,
    icon,
    selectable: true,
    children,
    className: classForNodeKey(key),
    data,
  };
}

const normalizeAllowedChildren = (types: readonly ObjectType[]): ObjectType[] =>
const normalizeAllowedChildren = (types: readonly ObjectType[]): ObjectType[] =>
  Array.from(
    new Set(types.filter((type) => Boolean(OBJECT_TYPE_DEFINITIONS[type]))),
    new Set(types.filter((type) => Boolean(OBJECT_TYPE_DEFINITIONS[type]))),
  );

const typedContainerData = (
  types: readonly ObjectType[],
  category?: string,
  preferredType?: ObjectType,
): Record<string, unknown> | undefined => {
  const allowedChildren = normalizeAllowedChildren(types);
  if (allowedChildren.length === 0) return undefined;
  const resolvedType =
    preferredType && allowedChildren.includes(preferredType)
      ? preferredType
      : allowedChildren.length === 1
        ? allowedChildren[0]
        : undefined;
  if (resolvedType) return { type: resolvedType, allowedChildren, category };
  return { allowedChildren, category };
};

function emptyPlaceholder(parentKey: string, message: string): DataNode {
  return {
    key: `${parentKey}:empty`,
    title: message,
    icon: iconAsset("/icons/explorer/metamodel-blueprint.svg", "placeholder"),
    isLeaf: true,
    selectable: false,
    className: "explorer-node",
  };
}

const businessArchIcon = iconAsset(
  "/rendering/archimate-icons/business-role.svg",
  "business",
);
const appArchIcon = iconAsset(
  "/rendering/archimate-icons/application-component.svg",
  "application",
);
const techArchIcon = iconAsset(
  "/rendering/archimate-icons/technology-node.svg",
  "technology",
);
const dataArchIcon = iconAsset(
  "/rendering/archimate-icons/application-dataobject.svg",
  "data",
);
const projectArchIcon = iconAsset(
  "/rendering/archimate-icons/implementation-workpackage.svg",
  "project",
);
const securityArchIcon = iconAsset(
  "/rendering/archimate-icons/motivation-constraint.svg",
  "security",
);
const principleArchIcon = iconAsset(
  "/rendering/archimate-icons/motivation-principle.svg",
  "principle",
);

// ---------------------------------------------------------------------------
// View grouping
// ---------------------------------------------------------------------------

function categorizeView(
  view: ViewInstance,
): "business" | "application" | "technology" | "strategy" {
  const viewpoint = ViewpointRegistry.get(view.viewpointId);
  if (!viewpoint) return "business";

  const businessTypes = new Set<ObjectType>([
    "Enterprise",
    "Department",
    "CapabilityCategory",
    "Capability",
    "SubCapability",
    "BusinessService",
    "BusinessProcess",
  ]);
  const applicationTypes = new Set<ObjectType>([
    "Application",
    "ApplicationService",
    "Interface",
  ]);
  const technologyTypes = new Set<ObjectType>([
    "Technology",
    "Node",
    "Compute",
    "Runtime",
    "Database",
    "Storage",
    "API",
    "MessageBroker",
    "IntegrationPlatform",
    "CloudService",
  ]);

  let bScore = 0,
    aScore = 0,
    tScore = 0;
  viewpoint.allowedElementTypes.forEach((t) => {
    if (businessTypes.has(t)) bScore += 1;
    if (applicationTypes.has(t)) aScore += 1;
    if (technologyTypes.has(t)) tScore += 1;
  });

  if (aScore >= bScore && aScore >= tScore) return "application";
  if (tScore >= bScore && tScore >= aScore) return "technology";
  return "business";
}

// ---------------------------------------------------------------------------
// Visibility filter
// ---------------------------------------------------------------------------

function isObjectTypeVisible(
  type: ObjectType,
  metadata: EaRepositoryMetadata | null,
): boolean {
  const frameworks = metadata?.enabledFrameworks?.length
    ? metadata.enabledFrameworks
    : metadata?.referenceFramework
      ? [metadata.referenceFramework]
      : [];
  if (frameworks.length === 0) return true;
  return frameworks.some((framework) => {
    if (framework === "Custom") {
      return isObjectTypeEnabledForFramework(
        "Custom",
        metadata?.frameworkConfig ?? undefined,
        type,
      );
    }
    return isObjectTypeAllowedForReferenceFramework(framework, type);
  });
}

// ---------------------------------------------------------------------------
// MAIN TREE BUILDER
// ---------------------------------------------------------------------------

export type ExplorerTreeInput = {
  objectsById: Map<
    string,
    { id: string; type: ObjectType; attributes: Record<string, unknown> }
  >;
  relationships: ReadonlyArray<{
    id?: string;
    fromId: string;
    toId: string;
    type: string;
  }>;
  metadata: EaRepositoryMetadata | null;
  views: readonly ViewInstance[];
  baselines: readonly Baseline[];
  plateaus: readonly Plateau[];
  roadmaps: readonly Roadmap[];
};

export type ExplorerTreeResult = {
  treeData: DataNode[];
  elementKeyIndex: Map<string, string>;
};

/**
 * Build the complete enterprise-grade explorer tree.
 *
 * Structure:
 * Workspace: <Name>.ea
 * ├── Repository (Properties, Audit Trail, Users & Roles, Access Control)
 * ├── Metamodel (Standards, Object Types, Relationship Types, Attributes, Viewpoints)
 * ├── Architectures → <ArchitectureName>
 * │   ├── Components (Business, Applications, Data, Technology, Security, Projects)
 * │   ├── Connections (All, App Deps, Data Flows, Deployments, Integrations)
 * │   ├── Catalogues (App, Tech, Risk, Vendor, Project Portfolio)
 * │   ├── Matrices (App vs Cap, App vs Tech, Cap vs Proc, Risk vs App)
 * │   ├── Diagrams (Business, Application, Technology, Strategy)
 * │   └── Roadmaps (Current, Target, Transition)
 * ├── Model Library (catalog browser for drag-to-diagram)
 * ├── Framework Packages (Industry, Security, Custom)
 * ├── Baselines (Snapshots, Archived)
 * ├── Reports (Impact, Cost, Risk, Compliance)
 * └── Settings (Integrations, Notifications, Monitoring, System Config)
 */
export function buildExplorerTree(
  input: ExplorerTreeInput,
): ExplorerTreeResult {
  const {
    objectsById,
    relationships,
    metadata,
    views,
    baselines,
    plateaus,
    roadmaps,
  } = input;

  const workspaceName =
    (metadata?.repositoryName ?? "Workspace").trim() || "Workspace";
  const archName = resolveArchitectureName(
    metadata?.repositoryName,
    metadata?.organizationName,
  );
  const categories = getObjectTypesByCategory();
  const metamodelLayers = getObjectTypesByMetamodelLayer();
  const relCategories = getRelationshipTypesByCategory();

  // Filter types by framework visibility
  const visibleTypes = (types: ObjectType[]) =>
    types.filter((t) => isObjectTypeVisible(t, metadata));

  const savedViews = views.filter((v) => v.status === "SAVED");
  const businessViews = savedViews.filter(
    (v) => categorizeView(v) === "business",
  );
  const applicationViews = savedViews.filter(
    (v) => categorizeView(v) === "application",
  );
  const technologyViews = savedViews.filter(
    (v) => categorizeView(v) === "technology",
  );
  const strategyViews = savedViews.filter(
    (v) => categorizeView(v) === "strategy",
  );

  // --- 1. Repository ---
  const repositoryIcon = iconAsset(
    '/icons/explorer/repository.svg',
    'repository',
  );
  const repositoryNode: DataNode = collectionNode(
    EXPLORER_KEYS.repository,
    "Repository",
    repositoryIcon,
    [
      {
        key: EXPLORER_KEYS.repoProperties,
        title: "Properties",
        icon: metamodelIcon,
        isLeaf: true,
        data: { settingKey: "repository-properties" },
      },
      {
        key: EXPLORER_KEYS.repoAuditTrail,
        title: "Audit Trail",
        icon: connectionIcon,
        isLeaf: true,
        data: { settingKey: "audit-trail" },
      },
      {
        key: EXPLORER_KEYS.repoUsersRoles,
        title: "Users & Roles",
        icon: businessArchIcon,
        isLeaf: true,
        data: { settingKey: "users-roles" },
      },
      {
        key: EXPLORER_KEYS.repoAccessControl,
        title: "Access Control",
        icon: securityArchIcon,
        isLeaf: true,
        data: { settingKey: "access-control" },
      },
    ],
  );

  // --- 2. Metamodel ---
  const metamodelObjectTypeChildren = (() => {
    const cats: DataNode[] = [];
    const layerEntries: [string, string, ObjectType[]][] = [
      [
        EXPLORER_KEYS.objectTypeBusiness,
        "Business Types",
        metamodelLayers.business,
      ],
      [
        EXPLORER_KEYS.objectTypeApplication,
        "Application Types",
        metamodelLayers.application,
      ],
      [
        EXPLORER_KEYS.objectTypeTechnology,
        "Technology Types",
        metamodelLayers.technology,
      ],
      [EXPLORER_KEYS.objectTypeData, "Data Types", metamodelLayers.data],
      [EXPLORER_KEYS.objectTypeCustom, "Custom Types", metamodelLayers.custom],
    ];
    for (const [key, title, types] of layerEntries) {
      const visible = visibleTypes(types);
      cats.push(
        collectionNode(
          key,
          title,
          metamodelIcon,
          visible.map((t) => ({
            key: EXPLORER_KEYS.metamodelTypeDef(t),
            title: titleForObjectType(t),
            icon: iconForObjectType(t),
            isLeaf: true,
            data: { metamodelType: t },
          })),
          typedContainerData(visible, title),
        ),
      );
    }
    return cats;
  })();

  const metamodelRelTypeChildren = (() => {
    const entries: [string, string, string[]][] = [
      [EXPLORER_KEYS.relTypeStructural, "Structural", relCategories.structural],
      [EXPLORER_KEYS.relTypeDependency, "Dependency", relCategories.dependency],
      [EXPLORER_KEYS.relTypeFlow, "Flow", relCategories.flow],
      [EXPLORER_KEYS.relTypeCustom, "Custom", relCategories.custom],
    ];
    return entries.map(([key, title, types]) =>
      collectionNode(
        key,
        title,
        connectionIcon,
        types.map((t) => ({
          key: EXPLORER_KEYS.metamodelRelDef(t),
          title: t.replace(/_/g, " "),
          icon: connectionIcon,
          isLeaf: true,
          data: { metamodelType: t },
        })),
      ),
    );
  })();

  const metamodelNode: DataNode = collectionNode(
    EXPLORER_KEYS.metamodel,
    "Metamodel",
    metamodelIcon,
    [
      {
        key: EXPLORER_KEYS.metamodelStandards,
        title: "Standards",
        icon: principleArchIcon,
        isLeaf: true,
        data: { settingKey: "metamodel-standards" },
      },
      collectionNode(
        EXPLORER_KEYS.metamodelObjectTypes,
        "Object Types",
        metamodelIcon,
        metamodelObjectTypeChildren,
      ),
      collectionNode(
        EXPLORER_KEYS.metamodelRelTypes,
        "Relationship Types",
        connectionIcon,
        metamodelRelTypeChildren,
      ),
      collectionNode(
        EXPLORER_KEYS.metamodelAttributes,
        "Attributes",
        catalogueIcon,
        [
          {
            key: EXPLORER_KEYS.attributesGlobal,
            title: "Global Attributes",
            icon: metamodelIcon,
            isLeaf: true,
          },
          {
            key: EXPLORER_KEYS.attributesTypeSpecific,
            title: "Type-Specific Attributes",
            icon: metamodelIcon,
            isLeaf: true,
          },
          {
            key: EXPLORER_KEYS.attributesCalculated,
            title: "Calculated Attributes",
            icon: metamodelIcon,
            isLeaf: true,
          },
        ],
      ),
      collectionNode(
        EXPLORER_KEYS.metamodelViewpoints,
        "Viewpoints",
        diagramIcon,
        [
          collectionNode(
            EXPLORER_KEYS.viewpointsBusiness,
            "Business Views",
            businessArchIcon,
            [],
          ),
          collectionNode(
            EXPLORER_KEYS.viewpointsApplication,
            "Application Views",
            appArchIcon,
            [],
          ),
          collectionNode(
            EXPLORER_KEYS.viewpointsTechnology,
            "Technology Views",
            techArchIcon,
            [],
          ),
          collectionNode(
            EXPLORER_KEYS.viewpointsStrategy,
            "Strategy Views",
            diagramIcon,
            [],
          ),
        ],
      ),
    ],
  );

  // --- 3. Architectures -> <ArchitectureName> ---
  const visCapabilities = visibleTypes(categories.capabilities);
  const visProcesses = visibleTypes(categories.processes);
  const visActors = visibleTypes(categories.actors);
  const visApplications = visibleTypes(categories.applications);
  const visAPIs = visibleTypes(categories.apis);
  const visServices = visibleTypes(categories.services);
  const visDataEntities: ObjectType[] = []; // data entities are modeled conceptually
  const visDataStores = visibleTypes(categories.dataStores);
  const visInfrastructure = visibleTypes(categories.infrastructure);
  const visNetwork = visibleTypes(categories.network);
  const visCloud = visibleTypes(categories.cloud);
  const visSecurity = visibleTypes(categories.security);
  const visProjects = visibleTypes(categories.projects);

  // Components sub-tree
  const businessNode: DataNode = collectionNode(
    EXPLORER_KEYS.componentBusiness(archName),
    "Business",
    businessArchIcon,
    [
      collectionNode(
        EXPLORER_KEYS.businessCapabilities(archName),
        "Capabilities",
        iconAsset(
          "/rendering/archimate-icons/strategy-capability.svg",
          "capability",
        ),
        elementLeaves(objectsById, visCapabilities),
        { ...typedContainerData(visCapabilities, 'Business'), quickCreate: { defaultType: (visCapabilities[0] ?? 'Capability') as ObjectType, category: 'Business' } },
      ),
      collectionNode(
        EXPLORER_KEYS.businessProcesses(archName),
        "Processes",
        iconAsset("/rendering/archimate-icons/business-process.svg", "process"),
        elementLeaves(objectsById, visProcesses),
        { ...typedContainerData(visProcesses, 'Business'), quickCreate: { defaultType: (visProcesses[0] ?? 'BusinessProcess') as ObjectType, category: 'Business' } },
      ),
      collectionNode(
        EXPLORER_KEYS.businessActors(archName),
        "Actors",
        iconAsset("/rendering/archimate-icons/business-actor.svg", "actor"),
        elementLeaves(objectsById, visActors),
        { ...typedContainerData(visActors, 'Business'), quickCreate: { defaultType: (visActors[0] ?? 'Department') as ObjectType, category: 'Business' } },
      ),
    ],
    {
      ...typedContainerData(
        [...visCapabilities, ...visProcesses, ...visActors],
        'Business',
        visCapabilities[0] ?? visProcesses[0] ?? visActors[0],
      ),
      quickCreate: { defaultType: 'BusinessProcess' as ObjectType, category: 'Business' },
    },
  );

  const applicationsNode: DataNode = collectionNode(
    EXPLORER_KEYS.componentApplications(archName),
    "Applications",
    appArchIcon,
    [
      collectionNode(
        EXPLORER_KEYS.appApplications(archName),
        "Applications",
        appArchIcon,
        elementLeaves(objectsById, visApplications),
        { ...typedContainerData(visApplications, 'Application'), quickCreate: { defaultType: (visApplications[0] ?? 'Application') as ObjectType, category: 'Application' } },
      ),
      collectionNode(
        EXPLORER_KEYS.appAPIs(archName),
        "APIs",
        iconAsset(
          "/rendering/archimate-icons/application-interface.svg",
          "api",
        ),
        elementLeaves(objectsById, visAPIs),
        { ...typedContainerData(visAPIs, 'Application'), quickCreate: { defaultType: (visAPIs[0] ?? 'API') as ObjectType, category: 'Application' } },
      ),
      collectionNode(
        EXPLORER_KEYS.appServices(archName),
        "Services",
        iconAsset(
          "/rendering/archimate-icons/application-service.svg",
          "service",
        ),
        elementLeaves(objectsById, visServices),
        { ...typedContainerData(visServices, 'Application'), quickCreate: { defaultType: (visServices[0] ?? 'ApplicationService') as ObjectType, category: 'Application' } },
      ),
    ],
    {
      ...typedContainerData(
        [...visApplications, ...visAPIs, ...visServices],
        'Application',
        visApplications[0] ?? visServices[0] ?? visAPIs[0],
      ),
      quickCreate: { defaultType: 'Application' as ObjectType, category: 'Application' },
    },
  );

  const dataNode: DataNode = collectionNode(
    EXPLORER_KEYS.componentData(archName),
    "Data",
    dataArchIcon,
    [
      collectionNode(
        EXPLORER_KEYS.dataEntities(archName),
        "Data Entities",
        dataArchIcon,
        elementLeaves(objectsById, visDataEntities),
        { ...typedContainerData(visDataEntities, 'Data'), quickCreate: { defaultType: 'Database' as ObjectType, category: 'Data' } },
      ),
      collectionNode(
        EXPLORER_KEYS.dataStores(archName),
        "Data Stores",
        iconAsset(
          "/rendering/archimate-icons/technology-artifact.svg",
          "datastore",
        ),
        elementLeaves(objectsById, visDataStores),
        { ...typedContainerData(visDataStores, 'Data'), quickCreate: { defaultType: (visDataStores[0] ?? 'Storage') as ObjectType, category: 'Data' } },
      ),
    ],
    {
      ...typedContainerData(
        [...visDataEntities, ...visDataStores],
        'Data',
        visDataEntities[0] ?? visDataStores[0],
      ),
      quickCreate: { defaultType: 'Database' as ObjectType, category: 'Data' },
    },
  );

  const technologyNode: DataNode = collectionNode(
    EXPLORER_KEYS.componentTechnology(archName),
    "Technology",
    techArchIcon,
    [
      collectionNode(
        EXPLORER_KEYS.techInfrastructure(archName),
        "Infrastructure",
        techArchIcon,
        elementLeaves(objectsById, visInfrastructure),
        { ...typedContainerData(visInfrastructure, 'Technology'), quickCreate: { defaultType: (visInfrastructure[0] ?? 'Node') as ObjectType, category: 'Technology' } },
      ),
      collectionNode(
        EXPLORER_KEYS.techNetwork(archName),
        "Network",
        iconAsset(
          "/rendering/archimate-icons/technology-communicationnetwork.svg",
          "network",
        ),
        elementLeaves(objectsById, visNetwork),
        { ...typedContainerData(visNetwork, 'Technology'), quickCreate: { defaultType: (visNetwork[0] ?? 'Network') as ObjectType, category: 'Technology' } },
      ),
      collectionNode(
        EXPLORER_KEYS.techCloud(archName),
        "Cloud Resources",
        iconAsset("/rendering/archimate-icons/technology-service.svg", "cloud"),
        elementLeaves(objectsById, visCloud),
        { ...typedContainerData(visCloud, 'Technology'), quickCreate: { defaultType: (visCloud[0] ?? 'CloudService') as ObjectType, category: 'Technology' } },
      ),
    ],
    {
      ...typedContainerData(
        [...visInfrastructure, ...visNetwork, ...visCloud],
        'Technology',
        visInfrastructure[0] ?? visCloud[0] ?? visNetwork[0],
      ),
      quickCreate: { defaultType: 'Node' as ObjectType, category: 'Technology' },
    },
  );

  const securityNode: DataNode = collectionNode(
    EXPLORER_KEYS.componentSecurity(archName),
    "Security",
    securityArchIcon,
    elementLeaves(objectsById, visSecurity),
    typedContainerData(visSecurity, "Governance", visSecurity[0]),
  );

  const projectsNode: DataNode = collectionNode(
    EXPLORER_KEYS.componentProjects(archName),
    "Projects",
    projectArchIcon,
    elementLeaves(objectsById, visProjects),
    typedContainerData(
      visProjects,
      "Implementation & Migration",
      visProjects[0],
    ),
  );

  const componentsNode: DataNode = collectionNode(
    EXPLORER_KEYS.archComponents(archName),
    "Components",
    componentIcon,
    [
      businessNode,
      applicationsNode,
      dataNode,
      technologyNode,
      securityNode,
      projectsNode,
    ],
    typedContainerData(
      [
        ...visCapabilities,
        ...visProcesses,
        ...visActors,
        ...visApplications,
        ...visAPIs,
        ...visServices,
        ...visDataEntities,
        ...visDataStores,
        ...visInfrastructure,
        ...visNetwork,
        ...visCloud,
        ...visSecurity,
        ...visProjects,
      ],
      "Components",
    ),
  );

  // Connections sub-tree
  const filterRelsByTypes = (relTypes: string[]): DataNode[] => {
    const typeSet = new Set(relTypes.map((t) => t.toLowerCase()));
    return relationships
      .filter((r) => typeSet.has(r.type.toLowerCase()))
      .slice(0, 200) // Cap for performance
      .map((r) => relationshipLeaf(r, objectsById));
  };

  const connectionsNode: DataNode = collectionNode(
    EXPLORER_KEYS.archConnections(archName),
    "Connections",
    connectionIcon,
    [
      collectionNode(
        EXPLORER_KEYS.connAllRelationships(archName),
        "All Relationships",
        connectionIcon,
        relationships
          .slice(0, 200)
          .map((r) => relationshipLeaf(r, objectsById)),
      ),
      collectionNode(
        EXPLORER_KEYS.connAppDependencies(archName),
        "Application Dependencies",
        connectionIcon,
        filterRelsByTypes(["DEPENDS_ON", "USES", "USED_BY", "CONSUMES"]),
      ),
      collectionNode(
        EXPLORER_KEYS.connDataFlows(archName),
        "Data Flows",
        connectionIcon,
        filterRelsByTypes([
          "TRIGGERS",
          "SERVED_BY",
          "INTEGRATES_WITH",
          "CONNECTS_TO",
        ]),
      ),
      collectionNode(
        EXPLORER_KEYS.connDeployments(archName),
        "Deployments",
        connectionIcon,
        filterRelsByTypes(["DEPLOYED_ON", "SUPPORTED_BY"]),
      ),
      collectionNode(
        EXPLORER_KEYS.connIntegrations(archName),
        "Integrations",
        connectionIcon,
        filterRelsByTypes(["INTEGRATES_WITH", "EXPOSES", "PROVIDED_BY"]),
      ),
    ],
    { quickCreate: { action: 'create-relationship' } },
  );

  // Catalogues sub-tree
  const cataloguesNode: DataNode = collectionNode(
    EXPLORER_KEYS.archCatalogues(archName),
    "Catalogues",
    catalogueIcon,
    [
      {
        key: EXPLORER_KEYS.catApplication(archName),
        title: "Application Catalogue",
        icon: catalogueIcon,
        isLeaf: true,
        data: { catalogKey: "applications" },
      },
      {
        key: EXPLORER_KEYS.catTechnology(archName),
        title: "Technology Catalogue",
        icon: catalogueIcon,
        isLeaf: true,
        data: { catalogKey: "technology" },
      },
      {
        key: EXPLORER_KEYS.catRisk(archName),
        title: "Risk Register",
        icon: catalogueIcon,
        isLeaf: true,
        data: { catalogKey: "risk" },
      },
      {
        key: EXPLORER_KEYS.catVendor(archName),
        title: "Vendor Register",
        icon: catalogueIcon,
        isLeaf: true,
        data: { catalogKey: "vendor" },
      },
      {
        key: EXPLORER_KEYS.catProjectPortfolio(archName),
        title: "Project Portfolio",
        icon: catalogueIcon,
        isLeaf: true,
        data: { catalogKey: "project-portfolio" },
      },
    ],
    { quickCreate: { action: 'open-catalog', defaultCatalog: 'applications' } },
  );

  // Matrices sub-tree
  const matricesNode: DataNode = collectionNode(
    EXPLORER_KEYS.archMatrices(archName),
    "Matrices",
    matrixIcon,
    [
      {
        key: EXPLORER_KEYS.matAppVsCap(archName),
        title: "App vs Capability",
        icon: matrixIcon,
        isLeaf: true,
        data: { matrixKey: "app-vs-cap" },
      },
      {
        key: EXPLORER_KEYS.matAppVsTech(archName),
        title: "App vs Technology",
        icon: matrixIcon,
        isLeaf: true,
        data: { matrixKey: "app-vs-tech" },
      },
      {
        key: EXPLORER_KEYS.matCapVsProc(archName),
        title: "Capability vs Process",
        icon: matrixIcon,
        isLeaf: true,
        data: { matrixKey: "cap-vs-proc" },
      },
      {
        key: EXPLORER_KEYS.matRiskVsApp(archName),
        title: "Risk vs Application",
        icon: matrixIcon,
        isLeaf: true,
        data: { matrixKey: "risk-vs-app" },
      },
    ],
    { quickCreate: { action: 'open-matrix', defaultMatrix: 'app-vs-cap' } },
  );

  // Diagrams sub-tree
  const makeDiagramCategory = (
    key: string,
    title: string,
    catViews: ViewInstance[],
  ): DataNode =>
    collectionNode(
      key,
      title,
      diagramIcon,
      catViews.length > 0
        ? catViews.map(viewLeaf)
        : [emptyPlaceholder(key, "No diagrams")],
    );

  const diagramsNode: DataNode = collectionNode(
    EXPLORER_KEYS.archDiagrams(archName),
    "Diagrams",
    diagramIcon,
    [
      makeDiagramCategory(
        EXPLORER_KEYS.diagBusiness(archName),
        "Business Diagrams",
        businessViews,
      ),
      makeDiagramCategory(
        EXPLORER_KEYS.diagApplication(archName),
        "Application Diagrams",
        applicationViews,
      ),
      makeDiagramCategory(
        EXPLORER_KEYS.diagTechnology(archName),
        "Technology Diagrams",
        technologyViews,
      ),
      makeDiagramCategory(
        EXPLORER_KEYS.diagStrategy(archName),
        "Strategy Diagrams",
        strategyViews,
      ),
    ],
    { quickCreate: { action: 'create-diagram' } },
  );

  // Roadmaps sub-tree
  const currentStateRoadmaps = roadmaps.filter((r) => {
    const name = (r.name ?? "").toLowerCase();
    return (
      name.includes("current") ||
      name.includes("as-is") ||
      name.includes("baseline")
    );
  });
  const targetStateRoadmaps = roadmaps.filter((r) => {
    const name = (r.name ?? "").toLowerCase();
    return (
      name.includes("target") ||
      name.includes("to-be") ||
      name.includes("future")
    );
  });
  const transitionRoadmaps = roadmaps.filter(
    (r) =>
      !currentStateRoadmaps.includes(r) && !targetStateRoadmaps.includes(r),
  );

  const roadmapsNode: DataNode = collectionNode(
    EXPLORER_KEYS.archRoadmaps(archName),
    "Roadmaps",
    frameworkIcon,
    [
      collectionNode(
        EXPLORER_KEYS.roadmapCurrent(archName),
        "Current State",
        frameworkIcon,
        currentStateRoadmaps.length > 0
          ? currentStateRoadmaps.map(roadmapLeaf)
          : [
              emptyPlaceholder(
                EXPLORER_KEYS.roadmapCurrent(archName),
                "No current state roadmaps",
              ),
            ],
      ),
      collectionNode(
        EXPLORER_KEYS.roadmapTarget(archName),
        "Target State",
        frameworkIcon,
        targetStateRoadmaps.length > 0
          ? targetStateRoadmaps.map(roadmapLeaf)
          : [
              emptyPlaceholder(
                EXPLORER_KEYS.roadmapTarget(archName),
                "No target state roadmaps",
              ),
            ],
      ),
      collectionNode(
        EXPLORER_KEYS.roadmapTransition(archName),
        "Transition States",
        frameworkIcon,
        transitionRoadmaps.length > 0
          ? [
              ...transitionRoadmaps.map(roadmapLeaf),
              ...plateaus.map(plateauLeaf),
            ]
          : plateaus.length > 0
            ? plateaus.map(plateauLeaf)
            : [
                emptyPlaceholder(
                  EXPLORER_KEYS.roadmapTransition(archName),
                  "No transition states",
                ),
              ],
      ),
    ],
    { quickCreate: { action: 'open-roadmap-planner' } },
  );

  // The Architecture container
  const architectureNode: DataNode = collectionNode(
    EXPLORER_KEYS.architecture(archName),
    archName,
    folderIcon,
    [
      componentsNode,
      connectionsNode,
      cataloguesNode,
      matricesNode,
      diagramsNode,
      roadmapsNode,
    ],
  );

  const architecturesIcon = iconAsset(
    '/icons/explorer/architecture.svg',
    'architectures',
  );
  const architecturesNode: DataNode = collectionNode(
    EXPLORER_KEYS.architectures,
    "Architectures",
    architecturesIcon,
    [architectureNode],
  );

  // --- 3b. Model Library ---
  const modelLibraryIcon = iconAsset(
    '/icons/explorer/model-library.svg',
    'model-library',
  );
  const modelLibraryNode: DataNode = {
    key: EXPLORER_KEYS.modelLibrary,
    title: 'Model Library',
    icon: modelLibraryIcon,
    isLeaf: true,
    className: 'explorer-node explorer-node-model-library',
    data: { modelLibrary: true },
  };

  // --- 4. Framework Packages ---
  const frameworkPackagesNode: DataNode = collectionNode(
    EXPLORER_KEYS.frameworkPackages,
    "Framework Packages",
    frameworkIcon,
    [
      {
        key: EXPLORER_KEYS.frameworkIndustry,
        title: "Industry Frameworks",
        icon: frameworkIcon,
        isLeaf: true,
      },
      {
        key: EXPLORER_KEYS.frameworkSecurity,
        title: "Security Frameworks",
        icon: frameworkIcon,
        isLeaf: true,
      },
      {
        key: EXPLORER_KEYS.frameworkCustom,
        title: "Custom Frameworks",
        icon: frameworkIcon,
        isLeaf: true,
      },
    ],
  );

  // --- 5. Baselines ---
  const activeBaselines = baselines.filter(
    (b) => !b.description?.toLowerCase().includes("archived"),
  );
  const archivedBaselines = baselines.filter((b) =>
    b.description?.toLowerCase().includes("archived"),
  );

  const baselinesIcon = iconAsset(
    '/icons/explorer/baseline.svg',
    'baselines',
  );
  const baselinesNode: DataNode = collectionNode(
    EXPLORER_KEYS.baselines,
    "Baselines",
    baselinesIcon,
    [
      collectionNode(
        EXPLORER_KEYS.baselineSnapshots,
        "Snapshots",
        frameworkIcon,
        activeBaselines.length > 0
          ? activeBaselines.map(baselineLeaf)
          : [emptyPlaceholder(EXPLORER_KEYS.baselineSnapshots, "No snapshots")],
      ),
      collectionNode(
        EXPLORER_KEYS.baselineArchived,
        "Archived States",
        frameworkIcon,
        archivedBaselines.length > 0
          ? archivedBaselines.map(baselineLeaf)
          : [
              emptyPlaceholder(
                EXPLORER_KEYS.baselineArchived,
                "No archived states",
              ),
            ],
      ),
    ],
  );

  // --- 6. Reports ---
  const reportsNode: DataNode = collectionNode(
    EXPLORER_KEYS.reports,
    "Reports",
    reportIcon,
    [
      {
        key: EXPLORER_KEYS.reportImpact,
        title: "Impact Analysis Reports",
        icon: reportIcon,
        isLeaf: true,
        data: { reportType: "impact" },
      },
      {
        key: EXPLORER_KEYS.reportCost,
        title: "Cost Reports",
        icon: reportIcon,
        isLeaf: true,
        data: { reportType: "cost" },
      },
      {
        key: EXPLORER_KEYS.reportRisk,
        title: "Risk Reports",
        icon: reportIcon,
        isLeaf: true,
        data: { reportType: "risk" },
      },
      {
        key: EXPLORER_KEYS.reportCompliance,
        title: "Compliance Reports",
        icon: reportIcon,
        isLeaf: true,
        data: { reportType: "compliance" },
      },
    ],
  );

  // --- 7. Settings ---
  const settingsNode: DataNode = collectionNode(
    EXPLORER_KEYS.settings,
    "Settings",
    settingsIcon,
    [
      {
        key: EXPLORER_KEYS.settingsIntegrations,
        title: "Integrations",
        icon: settingsIcon,
        isLeaf: true,
        data: { settingKey: "integrations" },
      },
      {
        key: EXPLORER_KEYS.settingsNotifications,
        title: "Notification Rules",
        icon: settingsIcon,
        isLeaf: true,
        data: { settingKey: "notifications" },
      },
      {
        key: EXPLORER_KEYS.settingsMonitoring,
        title: "Monitoring Bindings",
        icon: settingsIcon,
        isLeaf: true,
        data: { settingKey: "monitoring" },
      },
      {
        key: EXPLORER_KEYS.settingsSystemConfig,
        title: "System Configuration",
        icon: settingsIcon,
        isLeaf: true,
        data: { settingKey: "system-config" },
      },
    ],
  );

  // --- Root ---
  const rootNode: DataNode = {
    ...collectionNode(
      EXPLORER_KEYS.root(workspaceName),
      `${workspaceName}.ea`,
      folderIcon,
      [
        repositoryNode,
        metamodelNode,
        architecturesNode,
        modelLibraryNode,
        frameworkPackagesNode,
        baselinesNode,
        reportsNode,
        settingsNode,
      ],
    ),
    className: "explorer-level-root",
  };

  const treeData: DataNode[] = [rootNode];

  // --- Depth classes (explorer-depth-0, explorer-depth-1, …) ---
  const assignDepthClasses = (nodes: DataNode[], depth: number) => {
    for (const node of nodes) {
      const depthClass = `explorer-depth-${Math.min(depth, 5)}`;
      node.className = node.className
        ? `${node.className} ${depthClass}`
        : depthClass;
      if (typeof window !== "undefined") {
        console.log("[ExplorerDepthBuild]", {
          depth,
          key: typeof node.key === "string" ? node.key : String(node.key),
          className: node.className,
        });
      }
      if (node.children) assignDepthClasses(node.children, depth + 1);
    }
  };
  assignDepthClasses(treeData, 0);

  // --- Element Key Index ---
  const elementKeyIndex = new Map<string, string>();
  const walk = (nodes: DataNode[]) => {
    for (const node of nodes) {
      const data = (node as any)?.data as { elementId?: string } | undefined;
      if (
        data?.elementId &&
        typeof node.key === "string" &&
        !elementKeyIndex.has(data.elementId)
      ) {
        elementKeyIndex.set(data.elementId, node.key);
      }
      if (node.children) walk(node.children);
    }
  };
  walk(treeData);

  return { treeData, elementKeyIndex };
}
