import { palette, type AppTheme } from './colors';

export const darkTheme: AppTheme = {
  mode: 'dark',
  statusBarStyle: 'light',
  colors: {
    background: palette.darkBackground,
    surface: palette.darkSurface,
    card: palette.darkCard,
    cardBorder: palette.darkCardBorder,
    surfaceElevated: palette.darkSurfaceElevated,
    input: palette.darkInput,
    border: palette.darkBorder,
    navigation: palette.darkNavigation,
    shadow: palette.darkShadow,

    text: palette.darkText,
    secondaryText: palette.darkTextMuted,
    textSubtle: palette.darkTextSubtle,
    placeholder: palette.darkPlaceholder,
    icon: palette.darkText,

    primary: palette.yellow,
    accent: palette.yellow,
    accentSoft: 'rgba(249, 229, 71, 0.16)',
    accentText: palette.dark,

    disabled: palette.darkDisabled,
    disabledText: palette.darkDisabledText,
    progressTrack: palette.darkProgressTrack,

    warning: palette.darkWarning,
    success: palette.darkSuccess,
    error: palette.darkError,
    danger: palette.darkError,
  },
  categoryAvatars: {
    time: { backgroundColor: 'rgba(249, 229, 71, 0.16)', color: palette.yellow },
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
};
