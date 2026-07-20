import { describe, expect, it } from 'vitest'
import { formatDate, localeFor, parseLocalDate } from './dateTime'

describe('dateTime', () => {
  it('parses date-only values as local calendar days', () => {
    const date = parseLocalDate('2026-01-01')
    expect(date?.getFullYear()).toBe(2026)
    expect(date?.getMonth()).toBe(0)
    expect(date?.getDate()).toBe(1)
  })

  it('keeps date-only formatting stable at timezone boundaries', () => {
    expect(formatDate('2026-12-31', 'en', { year: 'numeric', month: '2-digit', day: '2-digit' })).toBe('12/31/2026')
  })

  it('uses the active English and Arabic locales', () => {
    expect(localeFor('en')).toBe('en-US')
    expect(localeFor('ar')).toBe('ar')
    expect(formatDate('2026-01-01', 'ar')).not.toBe('')
  })
})
