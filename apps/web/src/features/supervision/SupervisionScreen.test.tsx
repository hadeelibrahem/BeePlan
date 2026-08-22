import { describe, expect, it } from 'vitest'
import { canCreateRestriction, identityLabel, initials, remainingMinutes } from './SupervisionScreen'

describe('Supervision safe identity presentation', () => {
  it('prefers a safe display name', () => expect(identityLabel({ id:'1',displayName:'Hadeel Ibrahim',username:'hadeel',avatarUrl:null })).toBe('Hadeel Ibrahim'))
  it('falls back to public username', () => expect(identityLabel({ id:'1',displayName:' ',username:'hadeel',avatarUrl:null })).toBe('@hadeel'))
  it('uses safe initials without exposing the id', () => expect(initials({ id:'private-uuid',displayName:'Hadeel Ibrahim',username:null,avatarUrl:null })).toBe('HI'))
  it('derives remaining effort only from safe projected minutes', () => { expect(remainingMinutes(120,45)).toBe(75); expect(remainingMinutes(30,50)).toBe(0) })
  it('requires an eligible task for task-linked restrictions and approved apps for every restriction', () => {
    expect(canCreateRestriction('task_or_time', '', ['app-1'])).toBe(false)
    expect(canCreateRestriction('task', 'task-1', [])).toBe(false)
    expect(canCreateRestriction('time', '', ['app-1'])).toBe(true)
    expect(canCreateRestriction('task_or_time', 'task-1', ['app-1'])).toBe(true)
  })
})
