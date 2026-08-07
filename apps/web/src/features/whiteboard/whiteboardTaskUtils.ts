import type { ApiTask } from '../../lib/tasksApi'

export function getTaskSubtaskProgress(task: ApiTask) {
  const subtasks = task.subtasks ?? []
  const completed = subtasks.filter((subtask) => subtask.isDone || subtask.status === 'done').length
  return { completed, total: subtasks.length, percentage: subtasks.length ? Math.round((completed / subtasks.length) * 100) : 0 }
}

export function filterWhiteboardTasks(tasks: ApiTask[], search: string) {
  const query = search.trim().toLowerCase()
  return tasks.filter((task) => {
    if (task.isShared || task.status === 'done' || task.status === 'missed') return false
    return !query || task.title.toLowerCase().includes(query)
  })
}
