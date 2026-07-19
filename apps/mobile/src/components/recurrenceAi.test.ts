import assert from 'node:assert/strict'
import test from 'node:test'
import { applyAiRecurrence, parseAiRecurrence, type AiRecurrenceDraft } from './recurrenceAi.ts'
import type { AiRecurrenceParseResponse } from '../lib/tasksApi'

const weeklyResult: AiRecurrenceParseResponse = {
  repeat: 'weekly', interval: 1, daysOfWeek: ['Monday', 'Wednesday'], dayOfMonth: null,
  endCondition: 'never', endDate: null, occurrences: null, time: null,
  preview: 'Every Monday and Wednesday', confidence: 0.98, clarifyingQuestion: null,
}

const defaultRecurrenceSettings: AiRecurrenceDraft = {
  frequency: 'Never', weekdays: [], monthlyMode: 'sameDay', customInterval: 1,
  customUnit: 'weeks', endType: 'never', endDate: '', occurrences: 1,
}

test('parses a natural-language recurrence through the supplied API client', async () => {
  let message = ''
  const result = await parseAiRecurrence('  every Monday and Wednesday  ', async (value) => {
    message = value
    return weeklyResult
  })

  assert.equal(message, 'every Monday and Wednesday')
  assert.equal(result.preview, 'Every Monday and Wednesday')
})

test('rejects an invalid natural-language recurrence before calling the API', async () => {
  let calls = 0
  await assert.rejects(
    () => parseAiRecurrence('   ', async () => {
      calls += 1
      return weeklyResult
    }),
    /Describe how this task should repeat/,
  )
  assert.equal(calls, 0)
})

test('permits retry after an API failure', async () => {
  let calls = 0
  const parser = async () => {
    calls += 1
    if (calls === 1) throw new Error('Network unavailable')
    return weeklyResult
  }

  await assert.rejects(() => parseAiRecurrence('every Monday', parser), /Network unavailable/)
  const result = await parseAiRecurrence('every Monday', parser)
  assert.equal(calls, 2)
  assert.equal(result.repeat, 'weekly')
})

test('applies a parsed recurrence as an editable recurrence draft', () => {
  const applied = applyAiRecurrence(weeklyResult, defaultRecurrenceSettings)
  assert.deepEqual(applied, {
    ...defaultRecurrenceSettings,
    frequency: 'Weekly',
    weekdays: ['Monday', 'Wednesday'],
    customInterval: 1,
    customUnit: 'weeks',
  })
})
