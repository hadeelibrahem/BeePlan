/**
 * Pure, framework-free helpers for the Focus "Add More Time" feature. Shared by
 * the hook (timer math) and the add-time modal (validation) so the client and
 * the API DTO enforce one identical rule. Kept side-effect free for unit tests.
 */

// Must match the API DTO bounds (focus.logic.ts on the server).
export const FOCUS_EXTENSION_MIN_MINUTES = 1
export const FOCUS_EXTENSION_MAX_MINUTES = 480

/** Quick-add presets shown as buttons in the add-time modal. */
export const QUICK_EXTENSION_OPTIONS = [5, 10, 15, 30, 60] as const

export type ExtensionValidation =
  | { minutes: number; error: null }
  | { minutes: null; error: string }

/**
 * Validate raw "add time" input. Accepts positive whole minutes within
 * [MIN, MAX]; rejects empty, non-numeric, zero, negative, decimal, and
 * over-limit values with a clear message.
 */
export function validateExtensionMinutes(raw: string | number): ExtensionValidation {
  const normalized = typeof raw === 'string' ? raw.trim() : raw
  if (normalized === '' || normalized === null || normalized === undefined) {
    return { minutes: null, error: 'Enter how many minutes to add.' }
  }
  const value = Number(normalized)
  if (!Number.isFinite(value)) {
    return { minutes: null, error: 'Enter a valid number of minutes.' }
  }
  if (!Number.isInteger(value)) {
    return { minutes: null, error: 'Use whole minutes only.' }
  }
  if (value < FOCUS_EXTENSION_MIN_MINUTES) {
    return { minutes: null, error: `Add at least ${FOCUS_EXTENSION_MIN_MINUTES} minute.` }
  }
  if (value > FOCUS_EXTENSION_MAX_MINUTES) {
    return { minutes: null, error: `Add at most ${FOCUS_EXTENSION_MAX_MINUTES} minutes.` }
  }
  return { minutes: value, error: null }
}

/** Remaining whole seconds derived from an absolute end timestamp. */
export function computeRemainingSeconds(endsAtMs: number, nowMs: number): number {
  return Math.max(0, Math.floor((endsAtMs - nowMs) / 1000))
}

/**
 * New end timestamp when adding minutes, anchored on the later of the current
 * end and now — the same rule the server applies (computeExtendedEndTime).
 */
export function computeExtendedEndsAtMs(
  currentEndsAtMs: number,
  additionalMinutes: number,
  nowMs: number,
): number {
  return Math.max(currentEndsAtMs, nowMs) + additionalMinutes * 60_000
}
