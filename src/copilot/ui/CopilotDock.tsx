import { DoubleLeftOutlined, RobotOutlined } from '@ant-design/icons';
import { Button, Layout, Space, Tooltip, theme } from 'antd';
import React from 'react';
import { CopilotContextProvider } from '@/copilot/CopilotContextProvider';
import { getCopilotPanelComponent } from '@/copilot/extension';
import { trackCopilotEvent } from '@/copilot/telemetry';
import { useEaProject } from '@/ea/EaProjectContext';
import CopilotCommandPalette from './CopilotCommandPalette';
import CopilotPanel from './CopilotPanel';

export type CopilotDockProps = {
  children: React.ReactNode;
};

const DEFAULT_WIDTH = 420;
const MIN_WIDTH = 320;
const MAX_WIDTH = 720;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const readBool = (key: string, fallback: boolean) => {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return raw === 'true';
  } catch {
    return fallback;
  }
};

const readNumber = (key: string, fallback: number) => {
  try {
    const raw = localStorage.getItem(key);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
};

const writeValue = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Best-effort only.
  }
};

const CopilotDock: React.FC<CopilotDockProps> = ({ children }) => {
  const { token } = theme.useToken();
  const { project } = useEaProject();

  const PanelComponent = React.useMemo(
    () => getCopilotPanelComponent() ?? CopilotPanel,
    [],
  );

  const projectKey = project?.id ? `project:${project.id}` : 'project:none';
  const openKey = `ea.copilot.open:${projectKey}`;
  const widthKey = `ea.copilot.width:${projectKey}`;

  const [open, setOpen] = React.useState<boolean>(() =>
    readBool(openKey, true),
  );
  const [width, setWidth] = React.useState<number>(() =>
    clamp(readNumber(widthKey, DEFAULT_WIDTH), MIN_WIDTH, MAX_WIDTH),
  );
  const [isDragging, setIsDragging] = React.useState(false);

  const widthRef = React.useRef(width);
  const widthKeyRef = React.useRef(widthKey);

  React.useEffect(() => {
    // When project changes, load persisted state for that project.
    setOpen(readBool(openKey, true));
    setWidth(clamp(readNumber(widthKey, DEFAULT_WIDTH), MIN_WIDTH, MAX_WIDTH));
    widthKeyRef.current = widthKey;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openKey, widthKey]);

  React.useEffect(() => {
    widthRef.current = width;
  }, [width]);

  React.useEffect(() => {
    writeValue(openKey, String(open));
    if (open) trackCopilotEvent('copilot_opened', { projectKey });
    else trackCopilotEvent('copilot_closed', { projectKey });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const draggingRef = React.useRef<{
    startX: number;
    startWidth: number;
    active: boolean;
  }>({ startX: 0, startWidth: width, active: false });

  const rafRef = React.useRef<number | null>(null);
  const pendingWidthRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    const applyPendingWidth = () => {
      rafRef.current = null;
      if (pendingWidthRef.current === null) return;
      const next = pendingWidthRef.current;
      pendingWidthRef.current = null;
      setWidth(next);
    };

    const onMove = (e: PointerEvent) => {
      if (!draggingRef.current.active) return;
      const delta = draggingRef.current.startX - e.clientX;
      const nextWidth = clamp(
        draggingRef.current.startWidth + delta,
        MIN_WIDTH,
        MAX_WIDTH,
      );
      pendingWidthRef.current = nextWidth;
      if (rafRef.current !== null) return;
      rafRef.current = window.requestAnimationFrame(applyPendingWidth);
    };

    const onUp = () => {
      if (!draggingRef.current.active) return;
      draggingRef.current.active = false;
      setIsDragging(false);

      try {
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      } catch {
        // Best-effort only.
      }

      writeValue(widthKeyRef.current, String(widthRef.current));

      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      pendingWidthRef.current = null;
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  const toggleOpen = React.useCallback(() => {
    setOpen((prev) => !prev);
  }, []);

  return (
    <CopilotContextProvider>
      <div style={{ height: '100%', position: 'relative' }}>
        <CopilotCommandPalette />

        <Layout
          style={{
            height: '100%',
            minHeight: 0,
            background: token.colorBgLayout,
          }}
        >
          <Layout.Content
            style={{
              height: '100%',
              minHeight: 0,
              minWidth: 0,
              overflow: 'hidden',
            }}
          >
            {children}
          </Layout.Content>

          <Layout.Sider
            collapsed={!open}
            collapsedWidth={0}
            width={width}
            theme="light"
            trigger={null}
            style={{
              height: '100%',
              background: token.colorBgContainer,
              borderLeft: `1px solid ${token.colorBorderSecondary}`,
              boxShadow: `-6px 0 12px rgba(0,0,0,0.08)`,
              transition: isDragging ? 'none' : undefined,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Resize handle */}
            <div
              role="separator"
              aria-orientation="vertical"
              title="Resize"
              style={{
                position: 'absolute',
                left: -4,
                top: 0,
                width: 8,
                height: '100%',
                cursor: 'col-resize',
                background: 'transparent',
                zIndex: 10,
              }}
              onPointerDown={(e) => {
                try {
                  (e.currentTarget as any).setPointerCapture?.(e.pointerId);
                } catch {
                  // Best-effort only.
                }

                setIsDragging(true);
                try {
                  document.body.style.userSelect = 'none';
                  document.body.style.cursor = 'col-resize';
                } catch {
                  // Best-effort only.
                }

                draggingRef.current = {
                  startX: e.clientX,
                  startWidth: width,
                  active: true,
                };
              }}
            />

            <div
              style={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0,
              }}
            >
              <div
                style={{
                  padding: '8px 10px',
                  borderBottom: `1px solid ${token.colorBorderSecondary}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <Space size={8} align="center">
                  <RobotOutlined />
                  <span>Copilot</span>
                </Space>
                <Tooltip title="Collapse">
                  <Button
                    size="small"
                    type="text"
                    icon={<DoubleLeftOutlined />}
                    onClick={() => setOpen(false)}
                    aria-label="Collapse Copilot"
                  />
                </Tooltip>
              </div>

              <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                <PanelComponent />
              </div>
            </div>
          </Layout.Sider>
        </Layout>

        {!open ? (
          <div
            style={{
              position: 'absolute',
              top: 42,
              right: 0,
              paddingRight: 8,
            }}
          >
            <Tooltip title="Open Copilot">
              <Button
                type="primary"
                size="small"
                icon={<RobotOutlined />}
                onClick={toggleOpen}
                aria-label="Open Copilot"
              />
            </Tooltip>
          </div>
        ) : null}
      </div>
    </CopilotContextProvider>
  );
};

export default CopilotDock;
