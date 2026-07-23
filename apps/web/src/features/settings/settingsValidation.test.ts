import { describe, expect, it } from 'vitest'
import { validatePassword } from './settingsValidation'
describe('validatePassword', () => {
  it('matches the API password policy', () => expect(validatePassword('Strong1@')).toBe(''))
  it('rejects incomplete passwords', () => {
    expect(validatePassword('short')).toContain('8 characters')
    expect(validatePassword('lowercase1@')).toContain('uppercase')
    expect(validatePassword('UPPERCASE1@')).toContain('lowercase')
    expect(validatePassword('NoNumber@')).toContain('number')
    expect(validatePassword('NoSymbol1')).toContain('@')
  })
})
