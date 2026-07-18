import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { linking } from './linking.ts'

const appSource = readFileSync(resolve(import.meta.dirname, '../../App.tsx'), 'utf8')
const taskDetailsRouteSource = readFileSync(resolve(import.meta.dirname, 'TaskDetailsRoute.tsx'), 'utf8')
const editTaskRouteSource = readFileSync(resolve(import.meta.dirname, 'EditTaskRoute.tsx'), 'utf8')

test('AI Collaboration remains a typed deep-link stack route', () => {
  assert.equal(linking.config?.screens?.AiCollaboration, 'tasks/:taskId/collaboration')
})

test('App does not directly render the AI Collaboration screen or legacy screen state', () => {
  assert.doesNotMatch(appSource, /import AiCollaborationScreen/)
  assert.doesNotMatch(appSource, /screen === 'aiCollaboration'/)
  assert.doesNotMatch(appSource, /setScreen\('aiCollaboration'\)/)
})

test('migrated task routes navigate with the typed taskId parameter', () => {
  const typedNavigation = /navigation\.navigate\('AiCollaboration', \{ taskId \}\)/
  assert.match(taskDetailsRouteSource, typedNavigation)
  assert.match(editTaskRouteSource, typedNavigation)
})
