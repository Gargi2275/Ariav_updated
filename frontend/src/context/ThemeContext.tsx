import React from 'react';
import { usePreferences } from './PreferencesContext';
import { ThemeMode } from '../types/erp';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => <>{children}</>;

export function useTheme(): { theme: ThemeMode; toggleTheme: () => void; setTheme: (mode: ThemeMode) => void } {
  const { resolvedTheme, update } = usePreferences();
  return {
    theme: resolvedTheme,
    toggleTheme: () => { void update({ theme: resolvedTheme === 'dark' ? 'light' : 'dark' }); },
    setTheme: (mode: ThemeMode) => { void update({ theme: mode }); },
  };
};
