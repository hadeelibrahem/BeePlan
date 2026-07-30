import { describe, expect, it } from 'vitest'
import { shouldPlayCompletionBell } from './completionBell'

describe('completion bell transition guard', () => {
  const key = 'session-1:1000'
  it('plays only for a positive-to-zero transition', () => expect(shouldPlayCompletionBell({ previousRemaining: 1, remaining: 0, completionKey: key, playedKey: null, enabled: true })).toBe(true))
  it('does not replay a zero-state render', () => expect(shouldPlayCompletionBell({ previousRemaining: 0, remaining: 0, completionKey: key, playedKey: key, enabled: true })).toBe(false))
  it('does not play when an already-completed session initially loads', () => expect(shouldPlayCompletionBell({ previousRemaining: null, remaining: 0, completionKey: key, playedKey: null, enabled: true })).toBe(false))
  it('allows a newly extended deadline to ring once at its new end', () => expect(shouldPlayCompletionBell({ previousRemaining: 1, remaining: 0, completionKey: 'session-1:2000', playedKey: key, enabled: true })).toBe(true))
  it('allows a new session to ring', () => expect(shouldPlayCompletionBell({ previousRemaining: 1, remaining: 0, completionKey: 'session-2:3000', playedKey: key, enabled: true })).toBe(true))
  it('respects a disabled setting', () => expect(shouldPlayCompletionBell({ previousRemaining: 1, remaining: 0, completionKey: key, playedKey: null, enabled: false })).toBe(false))
})
