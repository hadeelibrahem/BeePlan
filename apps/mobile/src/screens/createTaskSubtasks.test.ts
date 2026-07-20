import assert from 'node:assert/strict'
import test from 'node:test'
import { addDraftSubtask, deleteDraftSubtask, draftSubtaskPayload, newDraftSubtask, persistDraftSubtasks, reorderDraftSubtask, toggleDraftSubtask, updateDraftSubtask, validateDraftSubtasks } from './createTaskSubtasks.ts'

test('adds, edits, completes, reorders, and deletes draft subtasks', () => {
  let items = addDraftSubtask([], { ...newDraftSubtask(), id: 'a', title: 'First' })
  items = addDraftSubtask(items, { ...newDraftSubtask(), id: 'b', title: 'Second' })
  items = updateDraftSubtask(items, 'a', { description: 'Details' })
  items = toggleDraftSubtask(items, 'a')
  items = reorderDraftSubtask(items, 1, 0)
  assert.deepEqual(items.map((item) => [item.id, item.orderIndex]), [['b', 0], ['a', 1]])
  assert.equal(items[1].isDone, true)
  assert.equal(items[1].description, 'Details')
  assert.deepEqual(deleteDraftSubtask(items, 'b').map((item) => item.id), ['a'])
})

test('uses web-compatible defaults and prevents untitled drafts', () => {
  const draft = newDraftSubtask()
  assert.equal(draft.priority, 'medium')
  assert.equal(draft.status, 'todo')
  assert.equal(validateDraftSubtasks([draft]), 'Every subtask needs a title.')
  assert.deepEqual(draftSubtaskPayload({ ...draft, title: 'Ship it' }), { title: 'Ship it', description: undefined, priority: 'medium', status: 'todo', isDone: false, estimatedDurationSource: 'user', reminderEnabled: false, tags: [] })
})

test('creates multiple drafts, preserves successful work after failure, and does not duplicate on retry', async () => {
  const items = [{ ...newDraftSubtask(), id: 'a', title: 'A' }, { ...newDraftSubtask(), id: 'b', title: 'B' }]
  const sent: string[] = []
  let partial = new Set<string>()
  await assert.rejects(() => persistDraftSubtasks(items, new Set(), async (payload) => { sent.push(payload.title); if (payload.title === 'B') throw new Error('offline') }, (ids) => { partial = ids }))
  assert.deepEqual(sent, ['A', 'B'])
  assert.deepEqual([...partial], ['a'])
  const persisted = await persistDraftSubtasks(items, partial, async (payload) => { sent.push(payload.title) })
  assert.deepEqual(sent, ['A', 'B', 'B'])
  assert.deepEqual([...persisted], ['a', 'b'])
})
