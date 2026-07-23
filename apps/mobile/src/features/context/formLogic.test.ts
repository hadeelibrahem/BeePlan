import assert from 'node:assert/strict'
import test from 'node:test'
import { parseAliases, validateCommitment, validateSavedPlace } from './formLogic.ts'

test('aliases are trimmed, empty entries removed, and duplicates removed', () => {
  assert.deepEqual(parseAliases('home, البيت, home, , house'), ['home', 'البيت', 'house'])
})

test('saved place validation enforces coordinates, radius, and API alias limit', () => {
  const valid = { name: 'Home', latitude: 31.9, longitude: 35.2, radiusMeters: 150, aliases: ['house'] }
  assert.equal(validateSavedPlace(valid), null)
  assert.match(validateSavedPlace({ ...valid, latitude: 100 }) ?? '', /valid location/)
  assert.match(validateSavedPlace({ ...valid, radiusMeters: 1.5 }) ?? '', /whole number/)
  assert.match(validateSavedPlace({ ...valid, aliases: Array.from({ length: 21 }, (_, index) => String(index)) }) ?? '', /20 aliases/)
})

test('commitment validation enforces days, times, and date bounds', () => {
  const valid = { title: 'Class', daysOfWeek: [1], startTime: '08:00', endTime: '09:30', startDate: '2026-01-01', endDate: '2026-06-01' }
  assert.equal(validateCommitment(valid), null)
  assert.match(validateCommitment({ ...valid, daysOfWeek: [] }) ?? '', /at least one day/)
  assert.match(validateCommitment({ ...valid, endTime: '07:00' }) ?? '', /after start/)
  assert.match(validateCommitment({ ...valid, endDate: '2025-12-31' }) ?? '', /on or after/)
})
