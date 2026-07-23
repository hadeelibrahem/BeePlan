import assert from 'node:assert/strict'
import test from 'node:test'
import { formatDays, formatTime, formatTimeRange, sortDays, toggleDay } from './dayOfWeek.ts'

test('formats a set of days in weekday order with short labels', () => {
  assert.equal(formatDays([3, 1, 2]), 'Mon, Tue, Wed')
})

test('de-duplicates and drops out-of-range days', () => {
  assert.deepEqual(sortDays([1, 1, 9, -2, 4]), [1, 4])
})

test('toggles a day on and off, keeping order', () => {
  assert.deepEqual(toggleDay([1, 3], 2), [1, 2, 3])
  assert.deepEqual(toggleDay([1, 2, 3], 2), [1, 3])
})

test('formats 24h times as 12h with period', () => {
  assert.equal(formatTime('08:00'), '8:00 AM')
  assert.equal(formatTime('13:05'), '1:05 PM')
  assert.equal(formatTime('00:30'), '12:30 AM')
  assert.equal(formatTime('12:00'), '12:00 PM')
})

test('formats a time range', () => {
  assert.equal(formatTimeRange('08:00', '11:00'), '8:00 AM – 11:00 AM')
})
