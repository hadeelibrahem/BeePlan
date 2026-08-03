import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { Appearance } from 'react-native';
import type { AppTheme, ThemeMode } from './colors';
import { darkTheme } from './darkTheme';
import { lightTheme } from './lightTheme';
import { isThemePreference, resolveThemeMode, type ThemePreference } from './themePreference';

export type { AppTheme, ThemeMode } from './colors';
export type { ThemePreference } from './themePreference';

const STORAGE_KEY = '@beeplan/theme-preference';

const themes: Record<ThemeMode, AppTheme> = {
  dark: darkTheme,
  light: lightTheme,
};

export type ThemeContextValue = {
  theme: AppTheme;
  mode: ThemeMode;
  preference: ThemePreference;
  isDark: boolean;
  toggleTheme: () => void;
  setThemeMode: (mode: ThemeMode) => void;
  setThemePreference: (preference: ThemePreference) => void;
};

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const [systemMode, setSystemMode] = useState<ThemeMode>(() => (Appearance.getColorScheme() === 'light' ? 'light' : 'dark'));
  const [preference, setPreference] = useState<ThemePreference>('system');

  useEffect(() => {
    let isMounted = true;

    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (!isMounted) return;
        if (isThemePreference(saved)) setPreference(saved);
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => setSystemMode(colorScheme === 'light' ? 'light' : 'dark'));
    return () => subscription.remove();
  }, []);

  const setThemePreference = useCallback((next: ThemePreference) => {
    setPreference(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }, []);

  const mode = resolveThemeMode(preference, systemMode);
  const setThemeMode = useCallback((next: ThemeMode) => setThemePreference(next), [setThemePreference]);

  const toggleTheme = useCallback(() => {
    setThemePreference(mode === 'dark' ? 'light' : 'dark');
  }, [mode, setThemePreference]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: themes[mode],
      mode,
      preference,
      isDark: mode === 'dark',
      toggleTheme,
      setThemeMode,
      setThemePreference,
    }),
    [mode, preference, toggleTheme, setThemeMode, setThemePreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
