import assert from 'node:assert/strict'
import test from 'node:test'

import { decideStrictSync, type StrictSyncInputs } from './strictSyncDecision.ts'

// Baseline: everything ready to arm a fresh session "s1", nothing armed yet.
function inputs(overrides: Partial<StrictSyncInputs> = {}): StrictSyncInputs {
  return {
    available: true,
    enabled: true,
    blockedCount: 2,
    usageAccess: true,
    activeSessionId: 's1',
    nativeActive: false,
    nativeSessionId: null,
    armedSessionId: null,
    ...overrides,
  }
}

test('strict mode disabled → does not arm', () => {
  assert.deepEqual(decideStrictSync(inputs({ enabled: false })), { type: 'noop' })
})

test('enabled without selected apps → does not arm', () => {
  assert.deepEqual(decideStrictSync(inputs({ blockedCount: 0 })), { type: 'noop' })
})

test('usage-access permission missing → does not arm', () => {
  assert.deepEqual(decideStrictSync(inputs({ usageAccess: false })), { type: 'noop' })
})

test('native module unavailable (iOS / Expo Go) → does not arm', () => {
  assert.deepEqual(decideStrictSync(inputs({ available: false })), { type: 'noop' })
})

test('permission granted after returning from settings → arms', () => {
  // Was blocked on permission (noop), user grants it, now everything is ready.
  const action = decideStrictSync(inputs({ usageAccess: true, armedSessionId: null }))
  assert.deepEqual(action, { type: 'arm', sessionId: 's1' })
})

test('native blocker starts exactly once — arms when unarmed', () => {
  assert.deepEqual(decideStrictSync(inputs({ armedSessionId: null })), { type: 'arm', sessionId: 's1' })
})

test('duplicate start prevented — already armed for this session is a noop', () => {
  const action = decideStrictSync(inputs({ armedSessionId: 's1', nativeActive: true, nativeSessionId: 's1' }))
  assert.deepEqual(action, { type: 'noop' })
})

test('completion stops the blocker — session cleared while armed → disarm', () => {
  const action = decideStrictSync(inputs({ activeSessionId: null, armedSessionId: 's1' }))
  assert.deepEqual(action, { type: 'disarm', reason: 'ended' })
})

test('cancellation stops the blocker — same as completion', () => {
  const action = decideStrictSync(inputs({ activeSessionId: null, armedSessionId: 's1', nativeActive: true }))
  assert.deepEqual(action, { type: 'disarm', reason: 'ended' })
})

test('navigation does not stop a valid armed session', () => {
  // Same session still active, still armed → nothing changes on a re-render.
  const action = decideStrictSync(inputs({ armedSessionId: 's1', nativeActive: true, nativeSessionId: 's1' }))
  assert.deepEqual(action, { type: 'noop' })
})

test('restore after process restart — active session, nothing armed → arm', () => {
  const action = decideStrictSync(inputs({ activeSessionId: 's1', armedSessionId: null, nativeActive: false }))
  assert.deepEqual(action, { type: 'arm', sessionId: 's1' })
})

test('expired/stale native session with no JS session → disarm stale', () => {
  const action = decideStrictSync(
    inputs({ enabled: true, activeSessionId: null, armedSessionId: null, nativeActive: true, nativeSessionId: 'old' }),
  )
  assert.deepEqual(action, { type: 'disarm', reason: 'stale' })
})

test('strict turned off mid-session while armed → disarm disabled', () => {
  const action = decideStrictSync(inputs({ enabled: false, armedSessionId: 's1' }))
  assert.deepEqual(action, { type: 'disarm', reason: 'disabled' })
})

test('native session id mismatch → re-arm to replace', () => {
  const action = decideStrictSync(
    inputs({ armedSessionId: 's1', nativeActive: true, nativeSessionId: 's-other' }),
  )
  assert.deepEqual(action, { type: 'arm', sessionId: 's1' })
})

test('new session replaces a previously armed one', () => {
  const action = decideStrictSync(inputs({ activeSessionId: 's2', armedSessionId: 's1' }))
  assert.deepEqual(action, { type: 'arm', sessionId: 's2' })
})

test('retry after a failed start — arm reset to null re-issues arm', () => {
  // The hook clears armedSessionId on failure; the next evaluation re-arms.
  const action = decideStrictSync(inputs({ armedSessionId: null }))
  assert.deepEqual(action, { type: 'arm', sessionId: 's1' })
})
