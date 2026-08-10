import assert from 'assert/strict'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import test from 'node:test'

// Mobile RN components can't be rendered under node:test here (no jest-native
// preset in this environment), so the shared behaviour (task-vs-subtask,
// ownership, missing data, overdue/blocked) is verified in the backend
// ai-collaboration-overview.logic.spec.ts and the web OverviewPanel.test.tsx.
// These source assertions guard that the mobile Overview stays wired to that
// same backend-derived payload and preserves the required actions.

const screen = readFileSync(resolve(import.meta.dirname, 'AiCollaborationScreen.tsx'), 'utf8')
const panel = readFileSync(
  resolve(import.meta.dirname, '../features/collaboration/components/ai/OverviewPanel.tsx'),
  'utf8',
)
const route = readFileSync(resolve(import.meta.dirname, '../navigation/AiCollaborationRoute.tsx'), 'utf8')

test('Overview tab renders the command-centre panel with focus + details wiring', () => {
  const overviewUsage = screen.match(/<OverviewPanel[\s\S]*?\/>/)?.[0] ?? ''
  assert.match(overviewUsage, /taskId=\{task\.id\}/)
  assert.match(overviewUsage, /onStartFocus=\{onStartFocus\}/)
  assert.match(overviewUsage, /onViewDetails=\{onBack\}/)
  // Navigation goes through the focus-carrying helper, not a bare setTab, so a
  // recommendation's deep link can apply filters on the destination tab.
  assert.match(overviewUsage, /onNavigate=\{navigateToTab\}/)
})

test('deep-link focus is threaded from Overview into Plan and Team', () => {
  assert.match(screen, /const \[focus, setFocus\] = useState<PlanFocus \| undefined>\(\)/)
  assert.match(screen, /<PlanView taskId=\{task\.id\} initialFocus=\{focus\} \/>/)
  assert.match(screen, /<TeamMemberList taskId=\{task\.id\} initialFocus=\{focus\} \/>/)
})

test('Overview reads the backend-derived aggregation (no client-side health score)', () => {
  assert.match(panel, /useOverviewQuery/)
  assert.doesNotMatch(panel, /deriveHealth|computeHealth|healthScore/)
})

test('Do This Now gates Start focus on backend canStartFocus AND a wired handler', () => {
  assert.match(panel, /doThisNow\.canStartFocus && onStartFocus/)
})

test('Overview renders all five required sections', () => {
  assert.match(panel, /Do this now/)
  assert.match(panel, /Critical alerts/)
  assert.match(panel, /Plan snapshot/)
  assert.match(panel, /Team snapshot/)
  assert.match(panel, /Project health/)
})

test('the AI decision loop sits on the Overview, right below Pending actions', () => {
  assert.match(panel, /Pending actions/)
  assert.match(panel, /<SuggestionsFeed taskId=\{taskId\} onNavigate=\{onNavigate\} \/>/)
  // Recommendations must appear before Do This Now (decisions first).
  assert.ok(panel.indexOf('<SuggestionsFeed') < panel.indexOf('<DoThisNowCard'))
})

test('recommendation approval reuses the existing endpoints and adds no client detection', () => {
  const feed = readFileSync(
    resolve(import.meta.dirname, '../features/collaboration/components/ai/SuggestionsFeed.tsx'),
    'utf8',
  )
  assert.match(feed, /useApproveSuggestionMutation/)
  assert.match(feed, /useDismissSuggestionMutation/)
  // Permissions and applicability are backend-decided, never re-derived here.
  assert.doesNotMatch(feed, /viewerRole === |role === 'owner'|detect[A-Z]/)
})

test('the review sheet previews impact without mutating anything', () => {
  const sheet = readFileSync(
    resolve(
      import.meta.dirname,
      '../features/collaboration/components/ai/RecommendationDetailSheet.tsx',
    ),
    'utf8',
  )
  assert.match(sheet, /useSuggestionPreviewQuery/)
  assert.match(sheet, /Nothing has been changed/)
  assert.match(sheet, /Problem|explanation\.problem/)
  assert.match(sheet, /explanation\.detection/)
  assert.match(sheet, /explanation\.evidence/)
})

test('the route starts a real focus session then navigates to the FocusSession screen', () => {
  assert.match(route, /startFocusSession\(accessToken, \{/)
  assert.match(route, /navigation\.navigate\('FocusSession'\)/)
})

test('the mobile card shows measured impact, not vague prose', () => {
  const card = readFileSync(
    resolve(import.meta.dirname, '../features/collaboration/components/ai/SuggestionCard.tsx'),
    'utf8',
  )
  assert.match(card, /Measured impact/)
  assert.match(card, /recommendation\.impact/)
  // The old vague impact line is gone.
  assert.doesNotMatch(card, /Impact: \{recommendation\.explanation\.expectedImprovement\}/)
})

test('confidence is a level with a reason and never a percentage', () => {
  const card = readFileSync(
    resolve(import.meta.dirname, '../features/collaboration/components/ai/SuggestionCard.tsx'),
    'utf8',
  )
  const sheet = readFileSync(
    resolve(
      import.meta.dirname,
      '../features/collaboration/components/ai/RecommendationDetailSheet.tsx',
    ),
    'utf8',
  )
  for (const source of [card, sheet]) {
    assert.match(source, /confidence\.reason/)
    assert.doesNotMatch(source, /confidence\.percent/)
  }
})

test('an auto-resolved card reports why it resolved', () => {
  const card = readFileSync(
    resolve(import.meta.dirname, '../features/collaboration/components/ai/SuggestionCard.tsx'),
    'utf8',
  )
  assert.match(card, /recommendation\.resolutionLabel/)
})
