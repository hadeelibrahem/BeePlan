import { palette, type AppTheme } from './colors';

export const lightTheme: AppTheme = {
  mode: 'light',
  statusBarStyle: 'dark',
  colors: {
    background: palette.lightBackground,
    surface: palette.lightSurface,
    card: palette.lightCard,
    cardBorder: palette.lightCardBorder,
    surfaceElevated: palette.lightSurfaceElevated,
    input: palette.lightInput,
    border: palette.lightBorder,
    navigation: palette.lightNavigation,
    shadow: palette.lightShadow,

    text: palette.lightText,
    secondaryText: palette.lightTextMuted,
    textSubtle: palette.lightTextSubtle,
    placeholder: palette.lightPlaceholder,
    icon: palette.lightText,

    primary: palette.yellow,
    accent: palette.yellow,
    accentSoft: 'rgba(249, 229, 71, 0.28)',
    accentText: palette.dark,

    disabled: palette.lightDisabled,
    disabledText: palette.lightDisabledText,
    progressTrack: palette.lightProgressTrack,

    warning: palette.lightWarning,
    success: palette.lightSuccess,
    error: palette.lightError,
    danger: palette.lightError,
  },
  categoryAvatars: {
    time: { backgroundColor: '#fff8bf', color: '#8f7e00' },
    location: { backgroundColor: '#dcfce7', color: '#166534' },
    context: { backgroundColor: '#ede9fe', color: '#5b21b6' },
    checklist: { backgroundColor: '#ffe4e6', color: '#9f1239' },
  },
  cardShadow: {
    color: palette.dark,
    opacity: 0.04,
    radius: 12,
    elevation: 2,
  },
};
