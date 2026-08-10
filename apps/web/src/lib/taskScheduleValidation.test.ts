import { describe, expect, it } from 'vitest'
import { canValidateTaskSchedule, INCOMPLETE_SCHEDULE_MESSAGE, taskScheduleValidationError } from './taskScheduleValidation'

describe('task schedule validation guard', () => {
  it('rejects an incomplete start-only schedule without duration', () => {
    const draft = { scheduledDate: '2026-08-09', scheduledStartTime: '14:00', scheduledEndTime: '', estimatedTimeMinutes: 0 }
    expect(canValidateTaskSchedule(draft)).toBe(false)
    expect(taskScheduleValidationError(draft)).toBe(INCOMPLETE_SCHEDULE_MESSAGE)
  })

  it('accepts an explicit end or positive duration', () => {
    expect(canValidateTaskSchedule({ scheduledDate: '2026-08-09', scheduledStartTime: '14:00', scheduledEndTime: '15:00', estimatedTimeMinutes: 0 })).toBe(true)
    expect(canValidateTaskSchedule({ scheduledDate: '2026-08-09', scheduledStartTime: '14:00', scheduledEndTime: '', estimatedTimeMinutes: 60 })).toBe(true)
  })
})
