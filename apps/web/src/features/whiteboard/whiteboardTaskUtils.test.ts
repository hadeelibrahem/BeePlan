import { describe, expect, it } from 'vitest'
import type { ApiTask } from '../../lib/tasksApi'
import { filterWhiteboardTasks, getTaskSubtaskProgress } from './whiteboardTaskUtils'

const task = (overrides: Partial<ApiTask> = {}): ApiTask => ({
  id: 'task-1', title: 'Prepare roadmap', description: '', priority: 'medium', status: 'todo', progress: 0,
  dueTime: '', subtasks: [], ...overrides,
})

describe('whiteboard task utilities', () => {
  it('shows only open personal tasks and searches by title', () => {
    const tasks = [
      task(),
      task({ id: 'task-2', title: 'Write report', status: 'done' }),
      task({ id: 'task-3', title: 'Shared roadmap', isShared: true }),
    ]
    expect(filterWhiteboardTasks(tasks, 'road')).toEqual([tasks[0]])
    expect(filterWhiteboardTasks(tasks, '')).toHaveLength(1)
  })

  it('calculates subtask progress from authoritative subtask state', () => {
    const result = getTaskSubtaskProgress(task({ subtasks: [
      { id: 's1', title: 'One', isDone: true, status: 'done' },
      { id: 's2', title: 'Two', isDone: false, status: 'todo' },
      { id: 's3', title: 'Three', isDone: false, status: 'done' },
    ] }))
    expect(result).toEqual({ completed: 2, total: 3, percentage: 67 })
  })
})
