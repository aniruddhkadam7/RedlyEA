import React from 'react';
import styles from './style.module.less';

export type NavigationSidebarLevel = 1 | 2 | 3;

export interface NavigationSidebarItem {
  key: string;
  label: React.ReactNode;
  level: NavigationSidebarLevel;
  icon?: React.ReactNode;
  selected?: boolean;
  onSelect?: () => void;
  draggable?: boolean;
  onDragStart?: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd?: (event: React.DragEvent<HTMLDivElement>) => void;
  actions?: React.ReactNode;
  muted?: boolean;
}

export interface NavigationSidebarGroup {
  key: string;
  items: NavigationSidebarItem[];
}

export interface NavigationSidebarProps {
  groups: NavigationSidebarGroup[];
  ariaLabel?: string;
}

const NavigationSidebar: React.FC<NavigationSidebarProps> = ({
  groups,
  ariaLabel = 'Sidebar navigation',
}) => {
  return (
    <nav className={styles.navigationSidebar} aria-label={ariaLabel}>
      {groups.map((group) => (
        <div key={group.key} className={styles.navigationSidebarGroup}>
          {group.items.map((item) => {
            const isClickable = typeof item.onSelect === 'function';
            const rowClassName = [
              styles.navigationSidebarRow,
              styles[`navigationSidebarRowLevel${item.level}`],
              isClickable ? styles.navigationSidebarRowClickable : '',
              item.draggable ? styles.navigationSidebarRowDraggable : '',
              item.selected ? styles.navigationSidebarRowSelected : '',
              item.muted ? styles.navigationSidebarRowMuted : '',
            ]
              .filter(Boolean)
              .join(' ');

            const content = (
              <>
                <span className={styles.navigationSidebarIconSlot}>
                  {item.icon ?? null}
                </span>
                <span className={styles.navigationSidebarLabel}>{item.label}</span>
                {item.actions ? (
                  <span
                    className={styles.navigationSidebarActions}
                    onClick={(event) => event.stopPropagation()}
                  >
                    {item.actions}
                  </span>
                ) : null}
              </>
            );

            if (!isClickable) {
              return (
                <div
                  key={item.key}
                  className={rowClassName}
                  draggable={item.draggable}
                  onDragStart={item.onDragStart}
                  onDragEnd={item.onDragEnd}
                >
                  {content}
                </div>
              );
            }

            return (
              <div
                key={item.key}
                className={rowClassName}
                role="button"
                tabIndex={0}
                draggable={item.draggable}
                onClick={() => item.onSelect?.()}
                onDragStart={item.onDragStart}
                onDragEnd={item.onDragEnd}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    item.onSelect?.();
                  }
                }}
              >
                {content}
              </div>
            );
          })}
        </div>
      ))}
    </nav>
  );
};

export default NavigationSidebar;