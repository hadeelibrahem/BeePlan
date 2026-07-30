// Presentation-only helpers for the AI decision loop. Every decision — what a
// recommendation is, whether it may be approved, whether a metric moving up is
// good — is made on the backend; these functions only turn those values into
// labels and tone classes, and are mirrored in the mobile app.

import type {
  ConfidenceLevel,
  DeltaDirection,
  DeltaUnit,
  PreviewDelta,
} from '../api/ai-collaboration.api'

/** Compact "Xh Ym" / "Ym" label for a minute count (never negative). */
export function formatMinutes(minutes: number): string {
  const total = Math.max(0, Math.round(minutes))
  const hours = Math.floor(total / 60)
  const mins = total % 60
  if (hours && mins) return `${hours}h ${mins}m`
  if (hours) return `${hours}h`
  return `${mins}m`
}

/** A tracked metric value in its own unit, or an em dash when unknown. */
export function formatDeltaValue(value: number | null, unit: DeltaUnit): string {
  if (value == null) return '—'
  switch (unit) {
    case 'days':
      return `${value} day${Math.abs(value) === 1 ? '' : 's'}`
    case 'minutes':
      return formatMinutes(value)
    case 'points':
      return `${value}`
    case 'percent':
      return `${value}%`
    default:
      return `${value}`
  }
}

/** Signed change with an explicit +/− so direction is readable without colour. */
export function formatDeltaChange(delta: PreviewDelta): string {
  if (delta.change == null) return '—'
  if (delta.change === 0) return 'No change'
  const sign = delta.change > 0 ? '+' : '−'
  return `${sign}${formatDeltaValue(Math.abs(delta.change), delta.unit)}`
}

/** Icon + text, never colour alone (accessibility rule used across this feature). */
export const DIRECTION_ICON: Record<DeltaDirection, string> = {
  better: '▲',
  worse: '▼',
  unchanged: '=',
}

export const DIRECTION_LABEL: Record<DeltaDirection, string> = {
  better: 'Improves',
  worse: 'Worsens',
  unchanged: 'Unchanged',
}

export const DIRECTION_TEXT_CLASS: Record<DeltaDirection, string> = {
  better: 'text-emerald-300',
  worse: 'text-red-300',
  unchanged: 'text-[var(--bp-muted)]',
}

export const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
  unavailable: 'Confidence unavailable',
}

export const CONFIDENCE_TEXT_CLASS: Record<ConfidenceLevel, string> = {
  high: 'text-emerald-300',
  medium: 'text-amber-300',
  low: 'text-red-300',
  unavailable: 'text-[var(--bp-muted)]',
}

/** Icon + text so the level never depends on colour alone. */
export const CONFIDENCE_ICON: Record<ConfidenceLevel, string> = {
  high: '●●●',
  medium: '●●○',
  low: '●○○',
  unavailable: '○○○',
}

/**
 * "Jul 30 → Jul 28" style before/after for one measured metric. Values are
 * already unit-typed by the backend; this only formats them.
 */
export function formatImpactValue(value: number | null, unit: DeltaUnit): string {
  return formatDeltaValue(value, unit)
}

export const RELATION_LABEL: Record<'subject' | 'from' | 'to', string> = {
  subject: 'Subject',
  from: 'Moving from',
  to: 'Moving to',
}
