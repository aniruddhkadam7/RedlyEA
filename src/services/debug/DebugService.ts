import { runtimeEnv } from '@/runtime/runtimeEnv';

type DebugResult = { ok: true } | { ok: false; error: string };

type DebugApi = {
  toggleDevTools: () => Promise<DebugResult>;
  openDevTools: () => Promise<DebugResult>;
  closeDevTools: () => Promise<DebugResult>;
};

type LegacyDesktopApi = {
  openDevTools: () => Promise<DebugResult>;
};

const getDebugApi = (): DebugApi | undefined => {
  const root = globalThis as typeof globalThis & { debugAPI?: DebugApi };
  const api = root.debugAPI;
  if (!api) return undefined;
  if (typeof api.toggleDevTools !== 'function') return undefined;
  return api;
};

const getLegacyDesktopApi = (): LegacyDesktopApi | undefined => {
  const root = globalThis as typeof globalThis & {
    eaDesktop?: LegacyDesktopApi;
  };
  const api = root.eaDesktop;
  if (!api || typeof api.openDevTools !== 'function') return undefined;
  return api;
};

const isDebugAllowed = (): boolean => {
  if (!runtimeEnv.isDesktop) return false;
  if (process.env.EA_DEBUG_TOOLS === '1') return true;
  return process.env.NODE_ENV !== 'production';
};

export class DebugService {
  static isEnabled(): boolean {
    return isDebugAllowed() && (Boolean(getDebugApi()) || Boolean(getLegacyDesktopApi()));
  }

  static async toggleDevTools(): Promise<DebugResult> {
    if (!isDebugAllowed()) return { ok: false, error: 'DevTools are disabled.' };
    const api = getDebugApi();
    if (!api) return DebugService.openDevTools();
    try {
      const res = await api.toggleDevTools();
      if (!res.ok) return DebugService.openDevTools();
      return res;
    } catch (err) {
      return DebugService.openDevTools();
    }
  }

  static async openDevTools(): Promise<DebugResult> {
    if (!isDebugAllowed()) return { ok: false, error: 'DevTools are disabled.' };
    const api = getDebugApi();
    if (api) return api.openDevTools();
    const legacy = getLegacyDesktopApi();
    if (legacy) return legacy.openDevTools();
    return { ok: false, error: 'Debug API unavailable.' };
  }

  static async closeDevTools(): Promise<DebugResult> {
    if (!isDebugAllowed()) return { ok: false, error: 'DevTools are disabled.' };
    const api = getDebugApi();
    if (!api) return { ok: false, error: 'Debug API unavailable.' };
    return api.closeDevTools();
  }
}
