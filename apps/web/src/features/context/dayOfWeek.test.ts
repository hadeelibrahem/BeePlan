import { describe, expect, it } from 'vitest'
import { formatDays, formatTime, formatTimeRange, sortDays, toggleDay } from './dayOfWeek'

describe('dayOfWeek helpers', () => {
  it('formats a set of days in weekday order with short labels', () => {
    expect(formatDays([3, 1, 2])).toBe('Mon, Tue, Wed')
  })

  it('de-duplicates and drops out-of-range days', () => {
    expect(sortDays([1, 1, 9, -2, 4])).toEqual([1, 4])
  })

  it('toggles a day on and off, keeping order', () => {
    expect(toggleDay([1, 3], 2)).toEqual([1, 2, 3])
    expect(toggleDay([1, 2, 3], 2)).toEqual([1, 3])
  })

  it('formats 24h times as 12h with period', () => {
    expect(formatTime('08:00')).toBe('8:00 AM')
    expect(formatTime('13:05')).toBe('1:05 PM')
    expect(formatTime('00:30')).toBe('12:30 AM')
    expect(formatTime('12:00')).toBe('12:00 PM')
  })

  it('formats a time range', () => {
    expect(formatTimeRange('08:00', '11:00')).toBe('8:00 AM – 11:00 AM')
  })
})
