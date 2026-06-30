// Raw color palette. Do not reference these directly from components —
// always go through theme.colors.* (see lightTheme.ts / darkTheme.ts).

export type ThemeMode = 'dark' | 'light';

export type ReminderCategory = 'time' | 'location' | 'context' | 'checklist';

export type ThemeColors = {
  background: string;
  surface: string;
  card: string;
  cardBorder: string;
  surfaceElevated: string;
  input: string;
  border: string;
  navigation: string;
  shadow: string;

  text: string;
  secondaryText: string;
  textSubtle: string;
  placeholder: string;
  icon: string;

  primary: string;
  accent: string;
  accentSoft: string;
  accentText: string;

  disabled: string;
  disabledText: string;
  progressTrack: string;

  warning: string;
  success: string;
  error: string;
  /** @deprecated use `error` */
  danger: string;
};

export type AppTheme = {
  mode: ThemeMode;
  colors: ThemeColors;
  categoryAvatars: Record<ReminderCategory, { backgroundColor: string; color: string }>;
  cardShadow: {
    color: string;
    opacity: number;
    radius: number;
    elevation: number;
  };
  statusBarStyle: 'light' | 'dark';
};

export const BRAND_YELLOW = '#F9E547';
export const BRAND_DARK = '#2b323f';

export const palette = {
  yellow: BRAND_YELLOW,
  dark: BRAND_DARK,
  white: '#FFFFFF',

  // Dark theme surfaces
  darkBackground: BRAND_DARK,
  darkCard: '#343d4c',
  darkSurface: 'rgba(255, 255, 255, 0.06)',
  darkSurfaceElevated: '#343d4c',
  darkInput: 'rgba(255, 255, 255, 0.08)',
  darkBorder: 'rgba(255, 255, 255, 0.13)',
  darkCardBorder: 'rgba(255, 255, 255, 0.05)',
  darkNavigation: '#1A2030',

  // Light theme surfaces
  lightBackground: '#f8f9fa',
  lightCard: '#ffffff',
  lightSurface: '#ffffff',
  lightSurfaceElevated: '#ffffff',
  lightInput: '#f4f5f7',
  lightBorder: 'rgba(43, 50, 63, 0.12)',
  lightCardBorder: 'rgba(43, 50, 63, 0.06)',
  lightNavigation: '#ffffff',

  // Text
  darkText: '#ffffff',
  darkTextMuted: '#d6dbe3',
  darkTextSubtle: '#aeb7c4',
  darkPlaceholder: '#9AA5B5',

  lightText: BRAND_DARK,
  lightTextMuted: '#6b7280',
  lightTextSubtle: '#6b7280',
  lightPlaceholder: '#9CA3AF',

  // Status
  darkSuccess: '#86efac',
  darkWarning: '#FB923C',
  darkError: '#fca5a5',

  lightSuccess: '#15803d',
  lightWarning: '#FB923C',
  lightError: '#dc2626',

  // Misc
  darkDisabled: 'rgba(255, 255, 255, 0.14)',
  darkDisabledText: 'rgba(255, 255, 255, 0.42)',
  darkProgressTrack: 'rgba(255, 255, 255, 0.14)',
  darkShadow: '#111827',

  lightDisabled: '#e5e7eb',
  lightDisabledText: '#9ca3af',
  lightProgressTrack: '#e9ecef',
  lightShadow: BRAND_DARK,
} as const;
