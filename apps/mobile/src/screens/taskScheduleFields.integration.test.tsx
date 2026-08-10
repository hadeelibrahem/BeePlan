import { createTaskPayload, validateCreateTask, type CreateTaskFormValues } from './createTaskForm'
import { canValidateTaskSchedule, INCOMPLETE_SCHEDULE_MESSAGE, taskScheduleValidationError } from './taskScheduleValidation'

const base: CreateTaskFormValues = {
  title: 'Scheduled work',
  description: '',
  notes: '',
  priority: 'Medium',
  status: 'To Do',
  category: 'Work',
  dueDate: new Date('2026-08-15T00:00:00.000Z'),
  dueTime: '17:00',
  scheduledDate: '2026-07-29',
  scheduledStartTime: '10:00',
  scheduledEndTime: '11:00',
  reminderEnabled: false,
  reminderBeforeMinutes: 30,
  estimatedHours: '1',
  labelsText: '',
}

describe('mobile task schedule fields', () => {
  it('keeps scheduled execution fields separate from deadline fields', () => {
    const payload = createTaskPayload(base, null)
    expect(payload.dueDate).toBe('2026-08-15T00:00:00.000Z')
    expect(payload.dueTime).toBe('17:00')
    expect(payload.scheduledDate).toBe('2026-07-29')
    expect(payload.scheduledStartTime).toBe('10:00')
    expect(payload.scheduledEndTime).toBe('11:00')
  })

  it('allows an unscheduled task and validates partial schedules', () => {
    expect(validateCreateTask({ ...base, scheduledDate: '', scheduledStartTime: '', scheduledEndTime: '' })).toBe('')
    expect(validateCreateTask({ ...base, scheduledDate: '2026-07-29', scheduledStartTime: '', scheduledEndTime: '' })).toContain('required together')
  })

  it('does not validate an incomplete interval', () => {
    const draft = { scheduledDate: '2026-07-29', scheduledStartTime: '10:00', scheduledEndTime: '', estimatedTimeMinutes: 0 }
    expect(canValidateTaskSchedule(draft)).toBe(false)
    expect(taskScheduleValidationError(draft)).toBe(INCOMPLETE_SCHEDULE_MESSAGE)
  })

  it('validates complete intervals and positive estimated durations', () => {
    expect(canValidateTaskSchedule({ scheduledDate: '2026-07-29', scheduledStartTime: '10:00', scheduledEndTime: '11:00', estimatedTimeMinutes: 0 })).toBe(true)
    expect(canValidateTaskSchedule({ scheduledDate: '2026-07-29', scheduledStartTime: '10:00', scheduledEndTime: '', estimatedTimeMinutes: 60 })).toBe(true)
    expect(canValidateTaskSchedule({ scheduledDate: '', scheduledStartTime: '', scheduledEndTime: '', estimatedTimeMinutes: 0 })).toBe(false)
  })

  it('maps one estimated hour to a positive duration in minutes', () => {
    expect(createTaskPayload({ ...base, scheduledEndTime: '', estimatedHours: '1' }, null).estimatedTimeMinutes).toBe(60)
  })
})
