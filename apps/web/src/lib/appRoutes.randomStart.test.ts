import { describe, expect, it } from 'vitest'
import { pathForScreen, resolveAppRoute } from './appRoutes'

describe('Random Start route', () => {
  it('round-trips the dedicated page path', () => {
    expect(pathForScreen('randomStart')).toBe('/random-start')
    expect(resolveAppRoute('/random-start')).toEqual({ screen: 'randomStart' })
  })
})
