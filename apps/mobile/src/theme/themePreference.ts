import type { ThemeMode } from './colors';
export type ThemePreference = ThemeMode | 'system';
export function resolveThemeMode(preference: ThemePreference, systemMode: ThemeMode): ThemeMode { return preference === 'system' ? systemMode : preference; }
export function isThemePreference(value: string | null): value is ThemePreference { return value === 'system' || value === 'light' || value === 'dark'; }
