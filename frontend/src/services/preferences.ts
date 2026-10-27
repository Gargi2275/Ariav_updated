/**
 * Personal workspace preferences. The server record is authoritative after sign-in.
 * localStorage is only a cache so the theme can paint before the API responds.
 */

import { apiUrl } from './apiBase';

export const PREFS_CACHE_KEY = 'ariav_prefs_cache';
export const AUTH_EVENT = 'ariav-auth';

export type ThemePreference = 'light' | 'dark' | 'system';
export type Density = 'compact' | 'comfortable' | 'spacious';
export type TextSize = 'sm' | 'md' | 'lg' | 'xl';
export type MotionPreference = 'system' | 'reduce' | 'allow';
export type SidebarPreference = 'expanded' | 'collapsed';
export type PageSize = 25 | 50 | 100;

export interface ModulePreference {
  pageSize?: PageSize | null;
  sortKey?: string | null;
  sortAsc?: boolean | null;
  hiddenColumns?: string[];
}

export interface Preferences {
  theme: ThemePreference;
  density: Density;
  textSize: TextSize;
  highContrast: boolean;
  largeTargets: boolean;
  reducedMotion: MotionPreference;
  tableDensity: Density;
  pageSize: PageSize;
  sidebar: SidebarPreference;
  landingScreenId: number | null;
  modules: Record<string, ModulePreference>;
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'dark',
  density: 'comfortable',
  textSize: 'md',
  highContrast: false,
  largeTargets: false,
  reducedMotion: 'system',
  tableDensity: 'comfortable',
  pageSize: 25,
  sidebar: 'expanded',
  landingScreenId: null,
  modules: {},
};

const THEME = new Set<ThemePreference>(['light', 'dark', 'system']);
const DENSITY = new Set<Density>(['compact', 'comfortable', 'spacious']);
const TEXT = new Set<TextSize>(['sm', 'md', 'lg', 'xl']);
const MOTION = new Set<MotionPreference>(['system', 'reduce', 'allow']);
const SIDEBAR = new Set<SidebarPreference>(['expanded', 'collapsed']);
const PAGES = new Set<PageSize>([25, 50, 100]);

export function mergePreferences(base: Preferences, partial: Partial<Preferences>): Preferences {
  const modules = partial.modules
    ? Object.entries(partial.modules).reduce<Record<string, ModulePreference>>((next, [id, patch]) => {
      next[id] = { ...(base.modules[id] || {}), ...patch };
      return next;
    }, { ...base.modules })
    : base.modules;
  return { ...base, ...partial, modules };
}

function choice<T extends string>(value: unknown, allowed: Set<T>, fallback: T): T {
  return typeof value === 'string' && allowed.has(value as T) ? value as T : fallback;
}

export function preferencesFromApi(raw: Partial<Record<string, unknown>> | null | undefined): Preferences {
  const source = raw || {};
  const modulesRaw = source.modules && typeof source.modules === 'object' ? source.modules as Record<string, Partial<ModulePreference> & { page_size?: number; sort_key?: string; sort_asc?: boolean; hidden_columns?: string[] }> : {};
  const modules: Record<string, ModulePreference> = {};
  Object.entries(modulesRaw).forEach(([id, row]) => {
    const pageSize = row.pageSize ?? row.page_size;
    modules[id] = {
      pageSize: PAGES.has(pageSize as PageSize) ? pageSize as PageSize : null,
      sortKey: typeof (row.sortKey ?? row.sort_key) === 'string' ? (row.sortKey ?? row.sort_key) as string : null,
      sortAsc: typeof (row.sortAsc ?? row.sort_asc) === 'boolean' ? (row.sortAsc ?? row.sort_asc) as boolean : null,
      hiddenColumns: Array.isArray(row.hiddenColumns) ? row.hiddenColumns : Array.isArray(row.hidden_columns) ? row.hidden_columns : [],
    };
  });
  const landing = source.landingScreenId ?? source.landing_screen_id;
  return {
    theme: choice(source.theme, THEME, DEFAULT_PREFERENCES.theme),
    density: choice(source.density, DENSITY, DEFAULT_PREFERENCES.density),
    textSize: choice(source.textSize ?? source.text_size, TEXT, DEFAULT_PREFERENCES.textSize),
    highContrast: typeof (source.highContrast ?? source.high_contrast) === 'boolean' ? Boolean(source.highContrast ?? source.high_contrast) : false,
    largeTargets: typeof (source.largeTargets ?? source.large_targets) === 'boolean' ? Boolean(source.largeTargets ?? source.large_targets) : false,
    reducedMotion: choice(source.reducedMotion ?? source.reduced_motion, MOTION, DEFAULT_PREFERENCES.reducedMotion),
    tableDensity: choice(source.tableDensity ?? source.table_density, DENSITY, DEFAULT_PREFERENCES.tableDensity),
    pageSize: PAGES.has(source.pageSize as PageSize) ? source.pageSize as PageSize : PAGES.has(source.page_size as PageSize) ? source.page_size as PageSize : DEFAULT_PREFERENCES.pageSize,
    sidebar: choice(source.sidebar, SIDEBAR, DEFAULT_PREFERENCES.sidebar),
    landingScreenId: typeof landing === 'number' ? landing : null,
    modules,
  };
}

export function preferencesToApi(partial: Partial<Preferences>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (partial.theme) body.theme = partial.theme;
  if (partial.density) body.density = partial.density;
  if (partial.textSize) body.text_size = partial.textSize;
  if (typeof partial.highContrast === 'boolean') body.high_contrast = partial.highContrast;
  if (typeof partial.largeTargets === 'boolean') body.large_targets = partial.largeTargets;
  if (partial.reducedMotion) body.reduced_motion = partial.reducedMotion;
  if (partial.tableDensity) body.table_density = partial.tableDensity;
  if (partial.pageSize) body.page_size = partial.pageSize;
  if (partial.sidebar) body.sidebar = partial.sidebar;
  if ('landingScreenId' in partial) body.landing_screen_id = partial.landingScreenId;
  if (partial.modules) {
    body.modules = Object.fromEntries(Object.entries(partial.modules).map(([id, row]) => [id, {
      ...(row.pageSize ? { page_size: row.pageSize } : {}),
      ...(row.sortKey ? { sort_key: row.sortKey } : {}),
      ...(typeof row.sortAsc === 'boolean' ? { sort_asc: row.sortAsc } : {}),
      ...(row.hiddenColumns ? { hidden_columns: row.hiddenColumns } : {}),
    }]));
  }
  return body;
}

export function readPreferenceCache(): Preferences {
  try {
    const raw = localStorage.getItem(PREFS_CACHE_KEY);
    if (raw) return preferencesFromApi(JSON.parse(raw) as Record<string, unknown>);
  } catch {
    return DEFAULT_PREFERENCES;
  }
  try {
    const legacy = localStorage.getItem('ariav_theme');
    if (legacy === 'light' || legacy === 'dark') return { ...DEFAULT_PREFERENCES, theme: legacy };
  } catch {
    /* ignore */
  }
  return DEFAULT_PREFERENCES;
}

export function writePreferenceCache(preferences: Preferences): void {
  try {
    localStorage.setItem(PREFS_CACHE_KEY, JSON.stringify(preferences));
    const resolved = resolveTheme(preferences.theme);
    localStorage.setItem('ariav_theme', resolved);
  } catch {
    /* cache is optional */
  }
}

export function notifyAuthChange(): void {
  window.dispatchEvent(new Event(AUTH_EVENT));
}

export function markFreshLogin(): void {
  sessionStorage.setItem('ariav_apply_landing', '1');
}

export function resolveTheme(theme: ThemePreference): 'light' | 'dark' {
  if (theme === 'light' || theme === 'dark') return theme;
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches === false) return 'light';
  return 'dark';
}

export function motionReduced(preference: MotionPreference): boolean {
  if (preference === 'reduce') return true;
  if (preference === 'allow') return false;
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

export function applyPreferences(preferences: Preferences): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const resolved = resolveTheme(preferences.theme);
  root.classList.toggle('theme-light', resolved === 'light');
  root.classList.toggle('theme-dark', resolved === 'dark');
  root.classList.toggle('theme-contrast', preferences.highContrast);
  root.classList.toggle('targets-large', preferences.largeTargets);
  root.classList.toggle('motion-reduce', motionReduced(preferences.reducedMotion));
  root.dataset.textSize = preferences.textSize;
  root.dataset.uiDensity = preferences.density;
  root.dataset.tableDensity = preferences.tableDensity;
  root.dataset.sidebar = preferences.sidebar;
  document.body.style.backgroundColor = resolved === 'light' ? '#F6F2E8' : '#0F141B';
  document.body.style.color = resolved === 'light' ? '#1B2430' : '#ECE9E1';
}

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('ariav_auth_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function parse(res: Response): Promise<{ preferences: Preferences; saved: boolean }> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = (data as { detail?: string }).detail || 'Could not save preferences.';
    throw new Error(typeof detail === 'string' ? detail : 'Could not save preferences.');
  }
  return {
    preferences: preferencesFromApi((data as { preferences?: Record<string, unknown> }).preferences),
    saved: Boolean((data as { saved?: boolean }).saved),
  };
}

export const preferencesApi = {
  get: () => fetch(apiUrl('/api/auth/preferences/'), { headers: authHeaders() }).then(parse),
  patch: (partial: Partial<Preferences>) => fetch(apiUrl('/api/auth/preferences/'), {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(preferencesToApi(partial)),
  }).then(parse),
  reset: () => fetch(apiUrl('/api/auth/preferences/reset/'), {
    method: 'POST',
    headers: authHeaders(),
    body: '{}',
  }).then(parse),
};
