import assert from 'node:assert/strict'
import test from 'node:test'
import { createsDependencyCycle } from './dependencyGraph.ts'
import type { ApiTask } from '../../lib/tasksApi.ts'

const task = (id: string, dependencies: string[] = []) => ({ id, dependencies: dependencies.map((dependencyId) => ({ id: dependencyId })) }) as ApiTask

test('rejects direct and transitive dependency cycles', () => {
  const tasks = [task('current'), task('a', ['current']), task('b', ['a']), task('safe')]
  assert.equal(createsDependencyCycle('current', 'current', tasks), true)
  assert.equal(createsDependencyCycle('current', 'a', tasks), true)
  assert.equal(createsDependencyCycle('current', 'b', tasks), true)
  assert.equal(createsDependencyCycle('current', 'safe', tasks), false)
})
