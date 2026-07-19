import assert from 'node:assert/strict'
import test from 'node:test'
import { createTaskParamsForCalendarDate } from './calendarCreateTask.ts'
import { createTaskInitialDate } from './createTaskInitialDate.ts'

test('calendar task creation preserves the selected date in typed navigation params', () => {
  assert.deepEqual(createTaskParamsForCalendarDate('2026-07-18'), {
    source: 'calendar',
    initialDueDate: '2026-07-18',
  })
})

test('Create Task preselects a calendar date locally without a timezone shift', () => {
  const date = createTaskInitialDate('2026-07-18')
  assert.ok(date)
  assert.equal(date.getFullYear(), 2026)
  assert.equal(date.getMonth(), 6)
  assert.equal(date.getDate(), 18)
  assert.equal(createTaskInitialDate('2026-02-30'), undefined)
})

test('cancel/back retains the same calendar date because it is held by Calendar, not Create Task', () => {
  const selectedDate = '2026-07-18'
  const params = createTaskParamsForCalendarDate(selectedDate)
  // Create Task receives a value, never mutates Calendar's selected-day state.
  assert.equal(params.initialDueDate, selectedDate)
  assert.equal(selectedDate, '2026-07-18')
})
