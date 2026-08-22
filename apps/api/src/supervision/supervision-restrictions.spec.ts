import { restrictionCompletionReason } from './supervision.service'

describe('Supervision restriction completion', () => {
  const now = new Date('2026-08-20T12:00:00Z')
  it('ends a task rule only when the authoritative task is done', () => {
    expect(restrictionCompletionReason({ restrictionMode: 'task', endsAt: new Date('9999-01-01') }, 'done', now)).toBe('task_completed')
    expect(restrictionCompletionReason({ restrictionMode: 'task', endsAt: new Date('2020-01-01') }, 'in_progress', now)).toBeNull()
  })
  it('ends a time rule when its deadline expires', () => expect(restrictionCompletionReason({ restrictionMode: 'time', endsAt: new Date('2026-08-20T11:59:59Z') }, null, now)).toBe('time_expired'))
  it('uses the first task-or-time trigger', () => {
    expect(restrictionCompletionReason({ restrictionMode: 'task_or_time', endsAt: new Date('2026-08-20T13:00:00Z') }, 'done', now)).toBe('task_completed')
    expect(restrictionCompletionReason({ restrictionMode: 'task_or_time', endsAt: new Date('2026-08-20T11:00:00Z') }, 'in_progress', now)).toBe('time_expired')
  })
})
