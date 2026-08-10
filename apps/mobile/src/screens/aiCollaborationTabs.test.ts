import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const screenSource = readFileSync(resolve(import.meta.dirname, 'AiCollaborationScreen.tsx'), 'utf8')
const distributionSource = readFileSync(
  resolve(import.meta.dirname, '../features/collaboration/components/ai/DistributionPanel.tsx'),
  'utf8',
)
const plannerApiSource = readFileSync(
  resolve(import.meta.dirname, '../features/collaboration/api/ai-collaboration-planner.api.ts'),
  'utf8',
)
const planViewSource = readFileSync(
  resolve(import.meta.dirname, '../features/collaboration/components/ai/PlanView.tsx'),
  'utf8',
)

test('AI Collaboration exposes the five dashboard tabs plus Distribution', () => {
  const labels = [...screenSource.matchAll(/label: '([^']+)'/g)].map((m) => m[1])
  assert.deepEqual(labels.slice(0, 6), ['Overview', 'Plan', 'Team', 'Health', 'Activity', 'Distribution'])
})

test('the old standalone tabs remain consolidated while Distribution is restored', () => {
  const tabKeyType = screenSource.match(/type TabKey = ([^;]+);/)?.[1] ?? ''
  assert.equal(tabKeyType.includes("'overview'"), true)
  assert.equal(tabKeyType.includes("'distribution'"), true)
  for (const removed of ['today', 'progress', 'suggestions', 'timeline', 'history']) {
    assert.equal(tabKeyType.includes(`'${removed}'`), false, `TabKey should not include '${removed}'`)
  }
})

test('each new tab renders its mapped content', () => {
  assert.match(screenSource, /tab === 'plan' \? \(\s*<PlanView/)
  // Team is the read-only Team Intelligence dashboard (redistribution deferred).
  // `initialFocus` lets a recommendation deep-link scope it to one member.
  assert.match(screenSource, /<TeamMemberList taskId=\{task\.id\} initialFocus=\{focus\} \/>/)
  // Health is the read-only Project Health dashboard.
  assert.match(screenSource, /<ProjectHealthPanel taskId=\{task\.id\} onNavigate=\{navigateToTab\} \/>/)
  // Activity keeps the history feed.
  assert.match(screenSource, /<HistoryFeed taskId=\{task\.id\} accessToken=\{accessToken\} \/>/)
  assert.match(screenSource, /import \{ DistributionPanel \}/)
  assert.match(screenSource, /tab === 'distribution' \? \(\s*<DistributionPanel task=\{task\} \/>/)
})

test('Distribution keeps the existing generation and apply planner flow reachable', () => {
  assert.match(distributionSource, /useGenerateCollaborationPlanMutation/)
  assert.match(distributionSource, /useApplyCollaborationPlanMutation/)
  assert.match(distributionSource, /Generate Plan/)
  assert.match(distributionSource, /applyMutation\.mutate/)
  assert.match(plannerApiSource, /ai\/collaboration-plan/)
  assert.match(plannerApiSource, /ai\/collaboration-plan\/apply/)
})

test('Plan hosts the Timeline | Dependency Graph switcher over the shared project-plan model', () => {
  assert.match(planViewSource, /label: 'Timeline'/)
  assert.match(planViewSource, /label: 'Dependency Graph'/)
  // Both views are backend-driven and share one detail surface.
  assert.match(planViewSource, /useProjectPlanQuery/)
  assert.match(planViewSource, /<PlanTimelineView/)
  assert.match(planViewSource, /<DependencyGraphView/)
  assert.match(planViewSource, /<PlanNodeDetail/)
})
