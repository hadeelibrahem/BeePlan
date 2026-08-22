import { notificationDestination } from './notificationRouting'
describe('challenge completion routes', () => {
  it('opens its challenge detail', () => expect(notificationDestination({ id:'n', type:'challenge_completed', title:'', body:'', sentAt:'', isRead:false, data:{ challengeId:'abc' } })).toEqual({ screen:'ChallengeDetail', challengeId:'abc' }))
  it('falls back to challenges', () => expect(notificationDestination({ id:'n', type:'challenge_completed', title:'', body:'', sentAt:'', isRead:false, data:{} })).toEqual({ screen:'Challenges' }))
})
