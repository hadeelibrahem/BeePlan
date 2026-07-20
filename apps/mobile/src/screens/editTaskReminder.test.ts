import assert from 'node:assert/strict'
import test from 'node:test'
import { canScheduleTaskReminder, validateTaskReminder } from './editTaskReminder.ts'

test('only enables task reminders for a complete due date and time', () => {
  const date = new Date('2026-07-18T00:00:00')
  assert.equal(canScheduleTaskReminder(date, '09:30'), true)
  assert.equal(canScheduleTaskReminder(date, ''), false)
  assert.equal(validateTaskReminder(true, date, ''), 'Set both a due date and time before enabling a task reminder.')
  assert.equal(validateTaskReminder(false, undefined, ''), '')
})
