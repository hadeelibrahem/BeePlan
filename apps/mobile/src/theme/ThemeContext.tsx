import { createContext, useContext, useMemo, useState, type PropsWithChildren } from 'react';

export type ThemeMode = 'dark' | 'light';
type ReminderCategory = 'time' | 'location' | 'context' | 'checklist';

const BRAND_DARK = '#2b323f';
const BRAND_YELLOW = '#fdef4b';

export type AppTheme = {
  mode: ThemeMode;
  colors: {
    background: string;
    card: string;
    cardBorder: string;
    surface: string;
    surfaceElevated: string;
    input: string;
    border: string;
    text: string;
    textMuted: string;
    textSubtle: string;
    icon: string;
    accent: string;
    accentSoft: string;
    accentText: string;
    disabled: string;
    disabledText: string;
    progressTrack: string;
    shadow: string;
    danger: string;
    success: string;
  };
  categoryAvatars: Record<ReminderCategory, { backgroundColor: string; color: string }>;
  cardShadow: {
    color: string;
    opacity: number;
    radius: number;
    elevation: number;
  };
  statusBarStyle: 'light' | 'dark';
};

type ThemeContextValue = {
  theme: AppTheme;
  mode: ThemeMode;
  toggleTheme: () => void;
};

const themes: Record<ThemeMode, AppTheme> = {
  dark: {
    mode: 'dark',
    statusBarStyle: 'light',
    colors: {
      background: BRAND_DARK,
      card: '#343d4c',
      cardBorder: 'rgba(255, 255, 255, 0.05)',
      surface: 'rgba(255, 255, 255, 0.06)',
      surfaceElevated: '#343d4c',
      input: 'rgba(255, 255, 255, 0.08)',
      border: 'rgba(255, 255, 255, 0.13)',
      text: '#ffffff',
      textMuted: '#d6dbe3',
      textSubtle: '#aeb7c4',
      icon: '#ffffff',
      accent: BRAND_YELLOW,
      accentSoft: 'rgba(253, 239, 75, 0.16)',
      accentText: BRAND_DARK,
      disabled: 'rgba(255, 255, 255, 0.14)',
      disabledText: 'rgba(255, 255, 255, 0.42)',
      progressTrack: 'rgba(255, 255, 255, 0.14)',
      shadow: '#111827',
      danger: '#fca5a5',
      success: '#86efac',
    },
    categoryAvatars: {
      time: { backgroundColor: 'rgba(253, 239, 75, 0.16)', color: BRAND_YELLOW },
      location: { backgroundColor: 'rgba(134, 239, 172, 0.14)', color: '#86efac' },
      context: { backgroundColor: 'rgba(196, 181, 253, 0.14)', color: '#c4b5fd' },
      checklist: { backgroundColor: 'rgba(253, 164, 175, 0.14)', color: '#fda4af' },
    },
    cardShadow: {
      color: '#111827',
      opacity: 0.16,
      radius: 16,
      elevation: 1,
    },
  },
  light: {
    mode: 'light',
    statusBarStyle: 'dark',
    colors: {
      background: '#f8f9fa',
      card: '#ffffff',
      cardBorder: 'rgba(43, 50, 63, 0.06)',
      surface: '#ffffff',
      surfaceElevated: '#ffffff',
      input: '#f4f5f7',
      border: 'rgba(43, 50, 63, 0.12)',
      text: BRAND_DARK,
      textMuted: '#6b7280',
      textSubtle: '#6b7280',
      icon: BRAND_DARK,
      accent: BRAND_YELLOW,
      accentSoft: 'rgba(253, 239, 75, 0.28)',
      accentText: BRAND_DARK,
      disabled: '#e5e7eb',
      disabledText: '#9ca3af',
      progressTrack: '#e9ecef',
      shadow: BRAND_DARK,
      danger: '#dc2626',
      success: '#15803d',
    },
    categoryAvatars: {
      time: { backgroundColor: '#fff8bf', color: '#8f7e00' },
      location: { backgroundColor: '#dcfce7', color: '#166534' },
      context: { backgroundColor: '#ede9fe', color: '#5b21b6' },
      checklist: { backgroundColor: '#ffe4e6', color: '#9f1239' },
    },
    cardShadow: {
      color: BRAND_DARK,
      opacity: 0.04,
      radius: 12,
      elevation: 2,
    },
  },
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const [mode, setMode] = useState<ThemeMode>('dark');

  const value = useMemo<ThemeContextValue>(() => {
    const isDarkMode = mode === 'dark';
    const activeTheme = isDarkMode ? themes.dark : themes.light;
    return {
      theme: activeTheme,
      mode,
      toggleTheme: () => setMode((current) => (current === 'dark' ? 'light' : 'dark')),
    };
  }, [mode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used inside ThemeProvider');
  }
  return context;
}
