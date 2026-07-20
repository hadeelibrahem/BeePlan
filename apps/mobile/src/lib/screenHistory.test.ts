import assert from 'node:assert/strict'
import test from 'node:test'
import { ScreenHistory } from './screenHistory.ts'

test('screen history returns the previous logical screen', () => {
  const history = new ScreenHistory<'dashboard' | 'tasks' | 'details'>()
  history.push('dashboard', 'tasks')
  history.push('tasks', 'details')
  assert.equal(history.pop(), 'tasks')
  assert.equal(history.pop(), 'dashboard')
})
