import { describe, expect, it } from 'vitest'
import { PRIORITY_BADGE_META, STATUS_BADGE_META } from './subtaskDisplay'

describe('task badge semantics', () => {
  it('keeps low priority positive rather than destructive', () => {
    expect(PRIORITY_BADGE_META.low).toEqual({ label: 'Low', tone: 'success' })
    expect(PRIORITY_BADGE_META.Low.tone).not.toBe('danger')
  })

  it('maps task and API status variants to the same semantic badge', () => {
    expect(STATUS_BADGE_META.todo).toEqual(STATUS_BADGE_META['To Do'])
    expect(STATUS_BADGE_META.in_progress).toEqual(STATUS_BADGE_META['In Progress'])
    expect(STATUS_BADGE_META.done.tone).toBe('success')
    expect(STATUS_BADGE_META.blocked.tone).toBe('danger')
  })

  it('uses ordered priority severity labels', () => {
    expect(PRIORITY_BADGE_META.medium.tone).toBe('warning')
    expect(PRIORITY_BADGE_META.high.tone).toBe('danger')
    expect(PRIORITY_BADGE_META.urgent.label).toBe('Urgent')
  })
})
