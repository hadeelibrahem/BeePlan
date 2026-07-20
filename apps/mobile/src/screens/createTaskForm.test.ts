import assert from 'node:assert/strict'
import test from 'node:test'
import { createTaskPayload, isCreateTaskDirty, validateCreateTask, type CreateTaskFormValues } from './createTaskForm.ts'

const completeForm: CreateTaskFormValues = {
  title: 'Ship mobile parity', description: 'Wire the create form', notes: 'Verify on Android', priority: 'High', status: 'In Progress', category: 'Work', dueDate: new Date('2026-07-20T00:00:00.000Z'), dueTime: '14:30', reminderEnabled: true, reminderBeforeMinutes: 60, estimatedHours: '2.5', labelsText: 'mobile, p0, mobile',
}

test('creates a payload with every supported create-task field', () => {
  assert.deepEqual(createTaskPayload(completeForm, null), {
    title: 'Ship mobile parity', description: 'Wire the create form', notes: 'Verify on Android', priority: 'high', status: 'in_progress', category: 'Work', dueDate: '2026-07-20T00:00:00.000Z', dueTime: '14:30', reminderEnabled: true, reminderBeforeMinutes: 60, estimatedTimeMinutes: 150, remainingTimeMinutes: 150, labels: ['mobile', 'p0'], recurrence: null,
  })
})

test('validates a required title and a non-negative estimated duration', () => {
  assert.equal(validateCreateTask({ ...completeForm, title: ' ' }), 'Task title is required.')
  assert.equal(validateCreateTask({ ...completeForm, estimatedHours: '-1' }), 'Estimated duration must be a non-negative number.')
})

test('cancel guard is clean initially and dirty after an edit', () => {
  assert.equal(isCreateTaskDirty({ ...completeForm, title: '', description: '', notes: '', priority: 'Medium', status: 'To Do', category: '', dueDate: undefined, dueTime: '', reminderEnabled: true, reminderBeforeMinutes: 30, estimatedHours: '', labelsText: '' }, false, false), false)
  assert.equal(isCreateTaskDirty(completeForm, false, false), true)
})

test('saved payload retains the values consumed by Edit Task', () => {
  const payload = createTaskPayload(completeForm, null)
  assert.equal(payload.category, 'Work')
  assert.equal(payload.estimatedTimeMinutes, 150)
  assert.equal(payload.notes, 'Verify on Android')
})
