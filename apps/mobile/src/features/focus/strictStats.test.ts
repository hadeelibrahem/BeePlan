import assert from 'node:assert/strict'
import test from 'node:test'

import { latestTimestampFor, summarizeEndReason } from './strictStats.ts'

test('summarizeEndReason: completed normally', () => {
  assert.deepEqual(summarizeEndReason('completed'), {
    usedEmergencyExit: false,
    completedNormally: true,
    endedEarly: false,
  })
})

test('summarizeEndReason: emergency exit is flagged and counts as ended early', () => {
  assert.deepEqual(summarizeEndReason('emergencyExit:need-app'), {
    usedEmergencyExit: true,
    completedNormally: false,
    endedEarly: true,
  })
})

test('summarizeEndReason: stopped/cancelled ended early without emergency exit', () => {
  assert.deepEqual(summarizeEndReason('stopped'), {
    usedEmergencyExit: false,
    completedNormally: false,
    endedEarly: true,
  })
})

test('summarizeEndReason: no reason yet (in progress)', () => {
  assert.deepEqual(summarizeEndReason(null), {
    usedEmergencyExit: false,
    completedNormally: false,
    endedEarly: false,
  })
})

test('latestTimestampFor returns the most recent attempt for a package', () => {
  const stats = {
    sessionId: 's1',
    totalAttempts: 3,
    totalInterruptedMs: 0,
    byPackage: [],
    events: [
      { sessionId: 's1', packageName: 'com.instagram.android', appName: 'Instagram', timestampMs: 100, interruptedMs: 0 },
      { sessionId: 's1', packageName: 'com.instagram.android', appName: 'Instagram', timestampMs: 300, interruptedMs: 0 },
      { sessionId: 's1', packageName: 'com.twitter.android', appName: 'X', timestampMs: 200, interruptedMs: 0 },
    ],
  }
  assert.equal(latestTimestampFor(stats, 'com.instagram.android'), 300)
  assert.equal(latestTimestampFor(stats, 'com.twitter.android'), 200)
  assert.equal(latestTimestampFor(stats, 'com.unknown.app'), null)
})
