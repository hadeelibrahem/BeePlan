import { describe, expect, it } from 'vitest'
import {
  QUICK_EXTENSION_OPTIONS,
  computeExtendedEndsAtMs,
  computeRemainingSeconds,
  validateExtensionMinutes,
} from './focusExtension'

describe('validateExtensionMinutes', () => {
  it('accepts the quick presets 5 / 10 / 15 / 30 / 60', () => {
    for (const option of QUICK_EXTENSION_OPTIONS) {
      expect(validateExtensionMinutes(option)).toEqual({ minutes: option, error: null })
    }
  })

  it('accepts a custom 25 minutes typed as a string', () => {
    expect(validateExtensionMinutes('25')).toEqual({ minutes: 25, error: null })
  })

  it('accepts the boundaries 1 and 480', () => {
    expect(validateExtensionMinutes(1).minutes).toBe(1)
    expect(validateExtensionMinutes(480).minutes).toBe(480)
  })

  it('rejects zero, negative, decimal, empty, non-numeric, and over-limit values', () => {
    expect(validateExtensionMinutes(0).error).toBeTruthy()
    expect(validateExtensionMinutes(-5).error).toBeTruthy()
    expect(validateExtensionMinutes('5.5').error).toBeTruthy()
    expect(validateExtensionMinutes('').error).toBeTruthy()
    expect(validateExtensionMinutes('   ').error).toBeTruthy()
    expect(validateExtensionMinutes('abc').error).toBeTruthy()
    expect(validateExtensionMinutes(481).error).toBeTruthy()
  })

  it('returns null minutes for every invalid value', () => {
    for (const bad of [0, -1, 1.5, '', 'x', 999]) {
      expect(validateExtensionMinutes(bad).minutes).toBeNull()
    }
  })
})

describe('computeExtendedEndsAtMs', () => {
  const now = Date.parse('2026-07-08T12:00:00.000Z')

  it('adds 25 minutes to a 1-minute-remaining session → ~26 minutes left', () => {
    const endsAt = now + 60_000 // 1 minute remaining
    const extended = computeExtendedEndsAtMs(endsAt, 25, now)
    expect(Math.round((extended - now) / 60_000)).toBe(26)
  })

  it('anchors on the current end when extending early', () => {
    const endsAt = now + 20 * 60_000
    expect(computeExtendedEndsAtMs(endsAt, 10, now)).toBe(endsAt + 10 * 60_000)
  })

  it('anchors on now when the end already elapsed', () => {
    const endsAt = now - 5 * 60_000 // ended 5 min ago
    expect(computeExtendedEndsAtMs(endsAt, 30, now)).toBe(now + 30 * 60_000)
  })

  it('compounds across repeated extensions', () => {
    const endsAt = now + 5 * 60_000
    const once = computeExtendedEndsAtMs(endsAt, 5, now)
    const twice = computeExtendedEndsAtMs(once, 60, now)
    expect(twice).toBe(endsAt + 65 * 60_000)
  })
})

describe('computeRemainingSeconds', () => {
  const now = Date.parse('2026-07-08T12:00:00.000Z')

  it('derives whole remaining seconds from the end timestamp', () => {
    expect(computeRemainingSeconds(now + 90_000, now)).toBe(90)
  })

  it('never goes negative', () => {
    expect(computeRemainingSeconds(now - 10_000, now)).toBe(0)
  })
})
