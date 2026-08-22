import { describe, expect, it } from 'vitest'
import { notificationTarget } from './notificationRoutes'
describe('challenge completion routes', () => {
  it('opens its challenge detail', () => expect(notificationTarget({ id:'n', type:'challenge_completed', title:'', body:'', sentAt:'', isRead:false, data:{ challengeId:'abc' } })).toBe('/challenges/abc'))
  it('falls back to challenges when the id is absent', () => expect(notificationTarget({ id:'n', type:'challenge_completed', title:'', body:'', sentAt:'', isRead:false, data:{} })).toBe('/challenges'))
})
