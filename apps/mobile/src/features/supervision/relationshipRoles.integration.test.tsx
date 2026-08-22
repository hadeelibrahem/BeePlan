import { splitRelationships } from './SupervisionScreen'

const relationship = (id: string, role: 'guardian' | 'supervised') => ({ id, status: 'active', currentRole: role, guardianUserId: 'guardian', supervisedUserId: 'supervised', guardian: { id: 'guardian', displayName: 'Fatima', username: 'fatima', avatarUrl: null }, supervisedUser: { id: 'supervised', displayName: 'Saleh', username: 'saleh', avatarUrl: null }, permissions: { level: 'accountability', can_view_task_progress: false, can_view_focus_progress: false, can_view_achievement_summary: false, can_view_weekly_summary: false } })

describe('mobile supervision relationship roles', () => {
  it('renders supervised active relationships under My Supervision instead of discarding them', () => expect(splitRelationships([relationship('supervised', 'supervised') as any]).supervised).toHaveLength(1))
  it('keeps guardian and supervised relationships available at the same time', () => { const groups = splitRelationships([relationship('guardian', 'guardian') as any, relationship('supervised', 'supervised') as any]); expect(groups.guardian).toHaveLength(1); expect(groups.supervised).toHaveLength(1) })
})
