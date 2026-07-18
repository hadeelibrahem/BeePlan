import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getGreetingPeriod, greetingTranslationKey } from './greeting.ts'

describe('getGreetingPeriod', () => {
  it('uses the local device hour at deterministic day boundaries', () => {
    assert.equal(getGreetingPeriod(new Date(2026, 0, 1, 0)), 'morning')
    assert.equal(getGreetingPeriod(new Date(2026, 0, 1, 11, 59)), 'morning')
    assert.equal(getGreetingPeriod(new Date(2026, 0, 1, 12)), 'afternoon')
    assert.equal(getGreetingPeriod(new Date(2026, 0, 1, 17, 59)), 'afternoon')
    assert.equal(getGreetingPeriod(new Date(2026, 0, 1, 18)), 'evening')
    assert.equal(greetingTranslationKey(new Date(2026, 0, 1, 18)), 'dashboard.greeting.evening')
  })
})
