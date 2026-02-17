import {
  ApartmentOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  MoreOutlined,
} from '@ant-design/icons';
import { Button, Dropdown, Input, Modal } from 'antd';
import React from 'react';
import { useLocation } from '@umijs/max';
import { useIdeShell } from './index';
import NavigationSidebar, {
  type NavigationSidebarGroup,
} from './NavigationSidebar';
import { useIdeSelection } from '@/ide/IdeSelectionContext';
import { message } from '@/ea/eaConsole';
import { setViewDragPayload } from '@/diagram-studio/drag-drop/DragDropConstants';

import { ViewStore } from '@/diagram-studio/view-runtime/ViewStore';
import { ViewpointRegistry } from '@/diagram-studio/viewpoints/ViewpointRegistry';
import type { ViewInstance } from '@/diagram-studio/viewpoints/ViewInstance';

const getSavedViews = (views: ViewInstance[]): ViewInstance[] =>
  views
    .filter((view) => view.status === 'SAVED')
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

const DiagramsTree: React.FC = () => {
  const { openRouteTab, studioMode, requestStudioViewSwitch } = useIdeShell();
  const { selection, setSelection, setSelectedElement } = useIdeSelection();
  const location = useLocation();

  const handleRenameView = React.useCallback((view: ViewInstance) => {
    let nextName = view.name;
    Modal.confirm({
      title: 'Rename view',
      okText: 'Rename',
      cancelText: 'Cancel',
      content: (
        <Input
          defaultValue={view.name}
          onChange={(event) => {
            nextName = event.target.value;
          }}
          placeholder="View name"
        />
      ),
      onOk: () => {
        const name = (nextName ?? '').trim();
        if (!name) {
          message.error('Name is required.');
          return Promise.reject();
        }
        ViewStore.update(view.id, (current) => ({ ...current, name }));
        try {
          window.dispatchEvent(new Event('ea:viewsChanged'));
        } catch {
          // Best-effort only.
        }
        message.success('View renamed.');
        return Promise.resolve();
      },
    });
  }, []);

  const handleDeleteView = React.useCallback((view: ViewInstance) => {
    Modal.confirm({
      title: 'Delete view?',
      content:
        'Deleting a view removes only the view definition. Repository content remains unchanged.',
      okText: 'Delete',
      okButtonProps: { danger: true },
      cancelText: 'Cancel',
      onOk: () => {
        const removed = ViewStore.remove(view.id);
        if (!removed) {
          message.error('Delete failed. View not found.');
          return;
        }
        try {
          window.dispatchEvent(new Event('ea:viewsChanged'));
        } catch {
          // Best-effort only.
        }
        message.success('View deleted.');
      },
    });
  }, []);

  const [savedViews, setSavedViews] = React.useState<ViewInstance[]>(() => {
    try {
      return getSavedViews(ViewStore.list());
    } catch {
      return [];
    }
  });

  React.useEffect(() => {
    const refresh = () => {
      try {
        setSavedViews(getSavedViews(ViewStore.list()));
      } catch {
        setSavedViews([]);
      }
    };

    refresh();
    window.addEventListener('ea:viewsChanged', refresh);
    return () => window.removeEventListener('ea:viewsChanged', refresh);
  }, []);

  const activeViewId = React.useMemo(() => {
    const path = location?.pathname ?? '';
    if (!path.startsWith('/views/')) return null;
    if (path.startsWith('/views/create')) return null;
    const parts = path.split('/').filter(Boolean);
    return parts.length >= 2 ? parts[1] : null;
  }, [location?.pathname]);

  const selectedKeys = React.useMemo(() => {
    if (activeViewId) return [`view:${activeViewId}`];
    if (selection.kind === 'view' && selection.keys.length > 0)
      return [`view:${selection.keys[0]}`];
    if (selection.kind === 'route' && selection.keys.length > 0)
      return [selection.keys[0]];
    return [] as string[];
  }, [activeViewId, selection.kind, selection.keys]);

  const groups: NavigationSidebarGroup[] = React.useMemo(
    () => [
      {
        key: 'diagrams-navigation',
        items: [
          {
            key: 'diagrams-root',
            label: 'Diagrams',
            level: 1,
            icon: <ApartmentOutlined />,
          },
          {
            key: 'diagrams-folder:saved',
            label: 'Saved Views',
            level: 2,
            icon: <FolderOpenOutlined />,
          },
          ...(savedViews.length === 0
            ? [
                {
                  key: 'view:empty',
                  label: 'No saved views',
                  level: 3 as const,
                  icon: <FileTextOutlined />,
                  muted: true,
                },
              ]
            : savedViews.map((view) => {
                const viewpoint = ViewpointRegistry.get(view.viewpointId);
                const viewpointLabel = viewpoint?.name ?? view.viewpointId;
                const key = `view:${view.id}`;

                return {
                  key,
                  label: `${view.name} (${viewpointLabel})`,
                  level: 3 as const,
                  icon: <FileTextOutlined />,
                  selected: selectedKeys.includes(key),
                  draggable: true,
                  onSelect: () => {
                    setSelection({ kind: 'view', keys: [view.id] });
                    if (studioMode) {
                      setSelectedElement(null);
                      setSelection({ kind: 'none', keys: [] });
                      requestStudioViewSwitch(view.id, { openMode: 'new' });
                      return;
                    }
                    openRouteTab(`/views/${view.id}`);
                  },
                  onDragStart: (event: React.DragEvent<HTMLDivElement>) => {
                    event.stopPropagation();
                    setViewDragPayload(event.dataTransfer, view.id);
                  },
                  actions: (
                    <Dropdown
                      trigger={['click']}
                      menu={{
                        items: [
                          { key: 'rename', label: 'Rename' },
                          { key: 'delete', label: 'Delete', danger: true },
                        ],
                        onClick: ({ key: action }) => {
                          if (action === 'rename') {
                            handleRenameView(view);
                          } else if (action === 'delete') {
                            handleDeleteView(view);
                          }
                        },
                      }}
                    >
                      <Button
                        type="text"
                        size="small"
                        icon={<MoreOutlined />}
                        aria-label={`Actions for ${view.name}`}
                      />
                    </Dropdown>
                  ),
                };
              })),
        ],
      },
    ],
    [
      handleDeleteView,
      handleRenameView,
      openRouteTab,
      requestStudioViewSwitch,
      savedViews,
      selectedKeys,
      setSelectedElement,
      setSelection,
      studioMode,
    ],
  );

  return <NavigationSidebar ariaLabel="Diagrams navigation" groups={groups} />;
};

export default DiagramsTree;
