import React, { createContext, useContext, useEffect, useState } from 'react';
import { ThemeMode } from '../types/erp';

interface ThemeContextType {
  theme: ThemeMode;
  toggleTheme: () => void;
  setTheme: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('ariav_theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return 'dark'; // Default to "Ledger Terminal" as requested
  });

  useEffect(() => {
    localStorage.setItem('ariav_theme', theme);
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.add('theme-light');
      root.classList.remove('theme-dark');
      document.body.style.backgroundColor = '#F6F2E8';
      document.body.style.color = '#1B2430';
    } else {
      root.classList.add('theme-dark');
      root.classList.remove('theme-light');
      document.body.style.backgroundColor = '#0F141B';
      document.body.style.color = '#ECE9E1';
    }
  }, [theme]);

  const toggleTheme = () => {
    setThemeState(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  const setTheme = (mode: ThemeMode) => {
    setThemeState(mode);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
