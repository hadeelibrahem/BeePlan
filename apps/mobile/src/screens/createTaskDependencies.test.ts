import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeDraftDependencyIds } from './createTaskDependencies.ts'

test('deduplicates draft dependencies and prevents a created task from depending on itself', () => {
  assert.deepEqual(normalizeDraftDependencyIds(['task-a', 'task-a', 'new-task', '', 'task-b'], 'new-task'), ['task-a', 'task-b'])
})
