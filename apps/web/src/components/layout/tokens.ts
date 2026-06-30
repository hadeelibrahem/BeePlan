// Raw hex values for places that need inline styles (e.g. SVG fills) rather than
// Tailwind classes. Tailwind class names must stay literal strings in each
// component (the JIT scanner can't resolve template-interpolated class names),
// so this file intentionally does not export composed className strings.
export const bp = {
  accent: '#FDEB4B',
  bg: '#252C3A',
  card: '#313848',
  border: '#46506A',
} as const
