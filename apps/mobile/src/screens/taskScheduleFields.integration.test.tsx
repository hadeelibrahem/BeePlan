import { createTaskPayload, validateCreateTask, type CreateTaskFormValues } from './createTaskForm'

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
})
