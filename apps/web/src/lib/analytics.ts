import type { ApiTask } from './tasksApi'

export type TaskAnalytics = {
  totalTasks: number
  completedTasks: number
  missedTasks: number
  completionRate: number
  byCategory: [string, number][]
  byPriority: [string, number][]
}

export type CompletionTrendPoint = {
  date: string
  completed: number
}

/**
 * Derive analytics from the task list. This is intentionally the ONLY place the
 * Analytics screen turns tasks into numbers, and it reads the same task array
 * the Tasks screen renders (the shared `queryKeys.tasks.list({})` cache), so the
 * completed/missed/total counts here always match what Tasks shows.
 */
export function computeTaskAnalytics(tasks: ApiTask[]): TaskAnalytics {
  const totalTasks = tasks.length
  const completedTasks = tasks.filter((task) => task.status === 'done').length
  const missedTasks = tasks.filter((task) => task.status === 'missed').length
  const completionRate = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100)

  return {
    totalTasks,
    completedTasks,
    missedTasks,
    completionRate,
    byCategory: groupCount(tasks, (task) => task.category || 'Uncategorized'),
    byPriority: groupCount(tasks, (task) => task.priority),
  }
}

/**
 * Counts task completions by local calendar day. Tasks without a server-recorded
 * completion time are intentionally excluded rather than guessed from updates.
 */
export function computeCompletionTrend(tasks: ApiTask[], now = new Date(), days = 14): CompletionTrendPoint[] {
  const safeDays = Math.max(1, Math.floor(days))
  const points = Array.from({ length: safeDays }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (safeDays - index - 1))
    return { date: localDateKey(date), completed: 0 }
  })
  const pointsByDate = new Map(points.map((point) => [point.date, point]))

  for (const task of tasks) {
    if (task.status !== 'done' || !task.completedAt) continue
    const completedAt = new Date(task.completedAt)
    if (Number.isNaN(completedAt.getTime())) continue
    const point = pointsByDate.get(localDateKey(completedAt))
    if (point) point.completed += 1
  }

  return points
}

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function groupCount<T>(items: T[], key: (item: T) => string): [string, number][] {
  const counts = new Map<string, number>()
  for (const item of items) {
    const label = key(item)
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
}
