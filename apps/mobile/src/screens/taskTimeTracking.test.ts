import assert from 'node:assert/strict'
import test from 'node:test'
import { taskTimeTracking } from './taskTimeTracking.ts'

test('formats API-provided task time tracking values like web', () => {
  assert.deepEqual(taskTimeTracking({ estimatedHours: 2.5, spentHours: 1, remainingHours: 1.5 }), { estimated: '2.5h', spent: '1h', remaining: '1.5h' })
  assert.deepEqual(taskTimeTracking({ estimatedHours: undefined as any, spentHours: 0, remainingHours: undefined as any }), { estimated: '—', spent: '0h', remaining: '—' })
})
