import {
  DatabaseOutlined,
  FolderOpenOutlined,
  HddOutlined,
  RocketOutlined,
  ShopOutlined,
} from '@ant-design/icons';
import { useLocation } from '@umijs/max';
import React from 'react';
import NavigationSidebar, {
  type NavigationSidebarGroup,
} from './NavigationSidebar';
import { useIdeShell } from './index';

const CATALOG_DOMAINS: Array<{
  key: string;
  label: string;
  path: string;
  icon: React.ReactNode;
}> = [
  {
    key: 'business',
    label: 'Business',
    path: '/catalog/business',
    icon: <FolderOpenOutlined />,
  },
  {
    key: 'application',
    label: 'Application',
    path: '/catalog/application',
    icon: <ShopOutlined />,
  },
  {
    key: 'data',
    label: 'Data',
    path: '/catalog/data',
    icon: <DatabaseOutlined />,
  },
  {
    key: 'technology',
    label: 'Technology',
    path: '/catalog/technology',
    icon: <HddOutlined />,
  },
  {
    key: 'implementation',
    label: 'Implementation',
    path: '/catalog/implementation',
    icon: <RocketOutlined />,
  },
];

const CatalogSidebar: React.FC = () => {
  const { openRouteTab } = useIdeShell();
  const location = useLocation();
  const pathname = location?.pathname ?? '';

  const groups: NavigationSidebarGroup[] = React.useMemo(
    () => [
      {
        key: 'catalog-domains',
        items: [
          {
            key: 'catalog-root',
            label: 'Catalog',
            level: 1,
            icon: <FolderOpenOutlined />,
          },
          ...CATALOG_DOMAINS.map((domain) => ({
            key: `catalog-domain:${domain.key}`,
            label: domain.label,
            level: 2 as const,
            icon: domain.icon,
            selected: pathname.startsWith(domain.path),
            onSelect: () => openRouteTab(domain.path),
          })),
        ],
      },
    ],
    [openRouteTab, pathname],
  );

  return <NavigationSidebar ariaLabel="Catalog navigation" groups={groups} />;
};

export default CatalogSidebar;