import type { ApiTask } from '../lib/tasksApi'

/** Makes cached/list task objects safe for the detail-only Edit sections. */
export function normalizeEditTask(task: ApiTask): ApiTask {
  return {
    ...task,
    dueTime: task.dueTime ?? '',
    notes: task.notes ?? '',
    subtasks: Array.isArray(task.subtasks) ? task.subtasks : [],
    dependencies: Array.isArray(task.dependencies) ? task.dependencies : [],
    recurrence: task.recurrence ?? null,
  }
}
