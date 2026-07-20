import { describe, expect, it } from 'vitest'
import { isoToDateKey } from './CalendarScreen'

describe('Calendar date grouping', () => {
  it('keeps a date-only due date on its intended local calendar day', () => {
    expect(isoToDateKey('2026-01-01')).toBe('2026-01-01')
    expect(isoToDateKey('2026-12-31')).toBe('2026-12-31')
  })

  it('returns null for invalid date values', () => {
    expect(isoToDateKey('not-a-date')).toBeNull()
  })
})
