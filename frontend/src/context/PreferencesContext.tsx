import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useErp } from './ErpContext';
import {
  AUTH_EVENT,
  DEFAULT_PREFERENCES,
  Preferences,
  applyPreferences,
  mergePreferences,
  preferencesApi,
  readPreferenceCache,
  resolveTheme,
  writePreferenceCache,
} from '../services/preferences';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface PreferencesContextValue {
  preferences: Preferences;
  ready: boolean;
  saveState: SaveState;
  saveError: string;
  resolvedTheme: 'light' | 'dark';
  update: (partial: Partial<Preferences>) => Promise<void>;
  reset: () => Promise<void>;
}

export const PreferencesContext = createContext<PreferencesContextValue | undefined>(undefined);

export const PreferencesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [preferences, setPreferences] = useState<Preferences>(() => readPreferenceCache());
  const [ready, setReady] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState('');
  const confirmed = useRef<Preferences>(preferences);

  useEffect(() => {
    applyPreferences(preferences);
  }, [preferences]);

  const adopt = useCallback((next: Preferences) => {
    confirmed.current = next;
    setPreferences(next);
    writePreferenceCache(next);
  }, []);

  const load = useCallback(async () => {
    const token = localStorage.getItem('ariav_auth_token');
    if (!token) {
      setReady(true);
      return;
    }
    try {
      const result = await preferencesApi.get();
      if (!result.saved) {
        const cached = readPreferenceCache();
        const seeded = await preferencesApi.patch({
          theme: cached.theme,
          density: cached.density,
          textSize: cached.textSize,
          highContrast: cached.highContrast,
          largeTargets: cached.largeTargets,
          reducedMotion: cached.reducedMotion,
          tableDensity: cached.tableDensity,
          pageSize: cached.pageSize,
          sidebar: cached.sidebar,
        });
        adopt(seeded.preferences);
      } else {
        adopt(result.preferences);
      }
      setSaveError('');
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not load preferences.');
    } finally {
      setReady(true);
    }
  }, [adopt]);

  useEffect(() => {
    void load();
    window.addEventListener(AUTH_EVENT, load);
    return () => window.removeEventListener(AUTH_EVENT, load);
  }, [load]);

  useEffect(() => {
    const themeMedia = window.matchMedia('(prefers-color-scheme: dark)');
    const motionMedia = window.matchMedia('(prefers-reduced-motion: reduce)');
    const refresh = () => applyPreferences(confirmed.current);
    themeMedia.addEventListener('change', refresh);
    motionMedia.addEventListener('change', refresh);
    return () => {
      themeMedia.removeEventListener('change', refresh);
      motionMedia.removeEventListener('change', refresh);
    };
  }, []);

  const update = useCallback(async (partial: Partial<Preferences>) => {
    const previous = confirmed.current;
    const next = mergePreferences(previous, partial);
    setPreferences(next);
    applyPreferences(next);
    const token = localStorage.getItem('ariav_auth_token');
    if (!token) {
      adopt(next);
      setSaveState('saved');
      return;
    }
    setSaveState('saving');
    setSaveError('');
    try {
      const saved = await preferencesApi.patch(partial);
      adopt(saved.preferences);
      setSaveState('saved');
    } catch (error) {
      adopt(previous);
      setSaveState('error');
      setSaveError(error instanceof Error ? error.message : 'Could not save preferences.');
    }
  }, [adopt]);

  const reset = useCallback(async () => {
    const previous = confirmed.current;
    setSaveState('saving');
    setSaveError('');
    try {
      const saved = await preferencesApi.reset();
      adopt(saved.preferences);
      setSaveState('saved');
    } catch (error) {
      adopt(previous);
      setSaveState('error');
      setSaveError(error instanceof Error ? error.message : 'Could not reset preferences.');
    }
  }, [adopt]);

  const resolvedTheme = resolveTheme(preferences.theme);
  const value = useMemo(() => ({
    preferences, ready, saveState, saveError, resolvedTheme, update, reset,
  }), [preferences, ready, saveState, saveError, resolvedTheme, update, reset]);

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
};

export function usePreferences(): PreferencesContextValue {
  const context = useContext(PreferencesContext);
  if (!context) throw new Error('usePreferences must be used within a PreferencesProvider');
  return context;
}

const ADMIN_ONLY = new Set([4, 5, 7, 8, 9, 10]);

export function canUseLanding(screenId: number, role: string | null): boolean {
  if (screenId <= 4) return false;
  if (role !== 'admin' && ADMIN_ONLY.has(screenId)) return false;
  return true;
}

export const LandingRedirect: React.FC = () => {
  const { ready, preferences } = usePreferences();
  const { navigateTo, userRole } = useErp();
  const applied = useRef(false);

  useEffect(() => {
    if (!ready || !userRole || applied.current) return;
    if (sessionStorage.getItem('ariav_apply_landing') !== '1') return;
    applied.current = true;
    sessionStorage.removeItem('ariav_apply_landing');
    const landing = preferences.landingScreenId;
    if (landing && canUseLanding(landing, userRole) && landing !== 6) navigateTo(landing);
  }, [ready, userRole, preferences.landingScreenId, navigateTo]);

  return null;
};
