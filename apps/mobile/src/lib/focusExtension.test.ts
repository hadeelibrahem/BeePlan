import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  QUICK_EXTENSION_OPTIONS,
  computeExtendedEndsAtMs,
  computeRemainingSeconds,
  validateExtensionMinutes,
} from './focusExtension.ts'

describe('validateExtensionMinutes', () => {
  it('accepts the quick presets 5 / 10 / 15 / 30 / 60', () => {
    for (const option of QUICK_EXTENSION_OPTIONS) {
      assert.deepEqual(validateExtensionMinutes(option), { minutes: option, error: null })
    }
  })

  it('accepts a custom 25 minutes typed as a string', () => {
    assert.deepEqual(validateExtensionMinutes('25'), { minutes: 25, error: null })
  })

  it('accepts the boundaries 1 and 480', () => {
    assert.equal(validateExtensionMinutes(1).minutes, 1)
    assert.equal(validateExtensionMinutes(480).minutes, 480)
  })

  it('rejects zero, negative, decimal, empty, non-numeric, and over-limit values', () => {
    for (const bad of [0, -5, '5.5', '', '   ', 'abc', 481]) {
      const result = validateExtensionMinutes(bad)
      assert.equal(result.minutes, null)
      assert.ok(result.error)
    }
  })
})

describe('computeExtendedEndsAtMs', () => {
  const now = Date.parse('2026-07-08T12:00:00.000Z')

  it('adds 25 minutes to a 1-minute-remaining session (~26 minutes left)', () => {
    const endsAt = now + 60_000
    const extended = computeExtendedEndsAtMs(endsAt, 25, now)
    assert.equal(Math.round((extended - now) / 60_000), 26)
  })

  it('anchors on the current end when extending early', () => {
    const endsAt = now + 20 * 60_000
    assert.equal(computeExtendedEndsAtMs(endsAt, 10, now), endsAt + 10 * 60_000)
  })

  it('anchors on now when the end already elapsed', () => {
    const endsAt = now - 5 * 60_000
    assert.equal(computeExtendedEndsAtMs(endsAt, 30, now), now + 30 * 60_000)
  })

  it('compounds across repeated extensions', () => {
    const endsAt = now + 5 * 60_000
    const once = computeExtendedEndsAtMs(endsAt, 5, now)
    const twice = computeExtendedEndsAtMs(once, 60, now)
    assert.equal(twice, endsAt + 65 * 60_000)
  })
})

describe('computeRemainingSeconds', () => {
  const now = Date.parse('2026-07-08T12:00:00.000Z')

  it('derives whole remaining seconds from the end timestamp', () => {
    assert.equal(computeRemainingSeconds(now + 90_000, now), 90)
  })

  it('never goes negative', () => {
    assert.equal(computeRemainingSeconds(now - 10_000, now), 0)
  })
})
