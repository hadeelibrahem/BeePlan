import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { Appearance } from 'react-native';
import type { AppTheme, ThemeMode } from './colors';
import { darkTheme } from './darkTheme';
import { lightTheme } from './lightTheme';

export type { AppTheme, ThemeMode } from './colors';

const STORAGE_KEY = '@beeplan/theme-preference';

const themes: Record<ThemeMode, AppTheme> = {
  dark: darkTheme,
  light: lightTheme,
};

export type ThemeContextValue = {
  theme: AppTheme;
  mode: ThemeMode;
  isDark: boolean;
  toggleTheme: () => void;
  setThemeMode: (mode: ThemeMode) => void;
};

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const [mode, setMode] = useState<ThemeMode>(() => (Appearance.getColorScheme() === 'light' ? 'light' : 'dark'));

  useEffect(() => {
    let isMounted = true;

    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (!isMounted) return;
        if (saved === 'light' || saved === 'dark') {
          setMode(saved);
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, []);

  const setThemeMode = useCallback((next: ThemeMode) => {
    setMode(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }, []);

  const toggleTheme = useCallback(() => {
    setMode((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: themes[mode],
      mode,
      isDark: mode === 'dark',
      toggleTheme,
      setThemeMode,
    }),
    [mode, toggleTheme, setThemeMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
