import assert from 'node:assert/strict'
import test from 'node:test'
import { formatUnavailableHours, parseBufferMinutes, parseUnavailableHours, savePlannerPreferencesOptimistically, setEnergyPreference, validatePlannerPreferences } from './plannerPreferences.ts'

const preferences: any = { focusStartTime: '08:00', focusEndTime: '11:00', workBlockMinutes: 50, breakMinutes: 10, energy: { morning: 'high', afternoon: 'medium', evening: 'low', night: 'low' }, scheduleHardTasksInFocus: true, finishStartedFirst: true, groupSimilarTasks: true, bufferBeforeMeetings: true, bufferMinutes: 15, maxDailyWorkMinutes: 480, emergencyBufferMinutes: 30, sleep: { start: '23:00', end: '07:00' }, lunch: { start: '13:00', end: '13:45' }, unavailableHours: [], note: '' }

test('loads and validates the planner preference model used by generation', () => {
  assert.equal(validatePlannerPreferences(preferences), '')
  assert.equal(validatePlannerPreferences({ ...preferences, focusStartTime: '12:00' }), 'Focus start time must be before focus end time.')
})

test('loads persisted energy preferences and updates the selected energy period', () => {
  const persisted = { ...preferences, energy: { morning: 'low', afternoon: 'high', evening: 'medium', night: 'low' } }
  assert.deepEqual(persisted.energy, { morning: 'low', afternoon: 'high', evening: 'medium', night: 'low' })
  assert.deepEqual(setEnergyPreference(persisted, 'night', 'high').energy, { morning: 'low', afternoon: 'high', evening: 'medium', night: 'high' })
})

test('accepts a valid meeting buffer and clamps invalid values to the API range', () => {
  assert.equal(parseBufferMinutes('20'), 20)
  assert.equal(parseBufferMinutes('not-a-number'), 0)
  assert.equal(parseBufferMinutes('61'), 60)
  assert.equal(parseBufferMinutes('-1'), 0)
  assert.equal(validatePlannerPreferences({ ...preferences, bufferMinutes: 60 }), '')
  assert.equal(validatePlannerPreferences({ ...preferences, bufferMinutes: 61 }), '')
})

test('rolls the preference cache back when an optimistic save fails', async () => {
  const next = setEnergyPreference({ ...preferences, bufferMinutes: 20 }, 'afternoon', 'high')
  const cached: any[] = []
  await assert.rejects(() => savePlannerPreferencesOptimistically(next, preferences, async () => { throw new Error('offline') }, { optimistic: (value) => cached.push(value), persisted: (value) => cached.push(value), rollback: (value) => cached.push(value) }), /offline/)
  assert.deepEqual(cached, [next, preferences])
})

test('a saved preference snapshot is the one available to the next plan generation', async () => {
  const saved = setEnergyPreference({ ...preferences, bufferMinutes: 25 }, 'morning', 'low')
  let generationPreferences: any
  await savePlannerPreferencesOptimistically(saved, preferences, async (value) => value, { optimistic: () => {}, persisted: (value) => { generationPreferences = value }, rollback: () => {} })
  assert.deepEqual(generationPreferences.energy, saved.energy)
  assert.equal(generationPreferences.bufferMinutes, 25)
})

test('updates unavailable-hour preferences without planner-side business logic', () => {
  assert.deepEqual(parseUnavailableHours('09:00-10:00, 18:00-19:30, invalid'), [{ start: '09:00', end: '10:00' }, { start: '18:00', end: '19:30' }])
  assert.equal(formatUnavailableHours([{ start: '09:00', end: '10:00' }]), '09:00-10:00')
})
