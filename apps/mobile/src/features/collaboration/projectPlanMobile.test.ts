import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

// Behavioural coverage for the shared model lives in the backend logic spec
// (project-plan.logic.spec.ts) and the web view-logic/PlanView tests. Mobile RN
// components can't render under node:test here, so these source assertions guard
// that the mobile Plan tab mirrors the same contract + shared view helpers and
// uses a simplified vertically-layered graph (never the desktop pan/zoom canvas).

const dir = resolve(import.meta.dirname, 'components/ai')
const graph = readFileSync(resolve(dir, 'DependencyGraphView.tsx'), 'utf8')
const timeline = readFileSync(resolve(dir, 'PlanTimelineView.tsx'), 'utf8')
const view = readFileSync(resolve(import.meta.dirname, 'lib/project-plan.view.ts'), 'utf8')

test('mobile graph is a simplified vertically-layered view, not a pan/zoom canvas', () => {
  assert.match(graph, /groupByLayer/)
  assert.doesNotMatch(graph, /onWheel|pointercapture|scale\(/i)
})

test('graph + timeline reuse the shared pure view helpers (no duplicated selection logic)', () => {
  assert.match(graph, /from '\.\.\/\.\.\/lib\/project-plan\.view'/)
  assert.match(timeline, /buildTimelineRows|timelineDomain/)
})

test('the shared view module mirrors the web contract surface', () => {
  for (const symbol of ['relatedPath', 'filterNodeIds', 'groupByLayer', 'buildTimelineRows', 'timelineDomain']) {
    assert.match(view, new RegExp(`export function ${symbol}`))
  }
})
