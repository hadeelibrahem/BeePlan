// Single unified BeePlan mobile design system. Tailwind/NativeWind class names
// must stay literal strings in each component (the JIT scanner can't resolve
// template-interpolated class names), so this file only exports raw hex for
// places that need inline styles (icons, SVG, dynamic colors) — not composed
// className strings.
export const bp = {
  accent: '#FDEB4B',
  background: '#252C3A',
  surface: '#313848',
  border: '#46506A',
  textPrimary: '#FFFFFF',
  textSecondary: '#9AA5B5',
  success: '#2DD4BF',
  warning: '#FB923C',
  danger: '#FB7185',
} as const

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
} as const

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const

export const typography = {
  title: { fontSize: 24, fontWeight: '800' as const },
  subtitle: { fontSize: 14, fontWeight: '500' as const },
  body: { fontSize: 14, fontWeight: '400' as const },
  caption: { fontSize: 12, fontWeight: '500' as const },
  badge: { fontSize: 11, fontWeight: '700' as const },
} as const
