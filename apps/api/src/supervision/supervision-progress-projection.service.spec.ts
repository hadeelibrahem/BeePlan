import { SupervisionProgressProjectionService } from './supervision-progress-projection.service'

describe('SupervisionProgressProjectionService privacy projection', () => {
  const service = new SupervisionProgressProjectionService({} as never)
  it('projects only guardian-safe task fields', () => {
    const now = new Date('2026-08-19T10:00:00Z')
    const projected = (service as any).taskDto({ id: 'task-1', title: 'Study', status: 'done', dueAt: now, progress: 100, estimatedMinutes: 30, focusedMinutes: 25, updatedAt: now, description: 'secret', notes: 'private', attachments: ['file'], comments: ['private'] }, new Date('2026-08-19T00:00:00Z'), new Date('2026-08-20T00:00:00Z'))
    expect(projected).toEqual(expect.objectContaining({ id: 'task-1', title: 'Study', completedAt: now, focusedMinutes: 25 }))
    expect(projected).not.toHaveProperty('description'); expect(projected).not.toHaveProperty('notes'); expect(projected).not.toHaveProperty('attachments'); expect(projected).not.toHaveProperty('comments')
  })
  it('does not invent a completion timestamp for unfinished tasks', () => {
    const projected = (service as any).taskDto({ id: 'task-2', title: 'Read', status: 'in_progress', dueAt: null, progress: 20, estimatedMinutes: 60, focusedMinutes: 10, updatedAt: new Date() }, new Date(), new Date())
    expect(projected.completedAt).toBeNull()
  })
})
