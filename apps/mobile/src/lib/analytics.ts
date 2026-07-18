import type { ApiTask } from './tasksApi'

export function computeTaskAnalytics(tasks: ApiTask[]) {
  const totalTasks = tasks.length
  const completedTasks = tasks.filter((task) => task.status === 'done').length
  const missedTasks = tasks.filter((task) => task.status === 'missed').length
  return { totalTasks, completedTasks, missedTasks, completionRate: totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0, byCategory: count(tasks, (task) => task.category || 'Uncategorized'), byPriority: count(tasks, (task) => task.priority) }
}

export function computeCompletionTrend(tasks: ApiTask[], days = 14, now = new Date()) {
  const safeDays = Math.max(1, Math.floor(days))
  const points = Array.from({ length: safeDays }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (safeDays - index - 1))
    return { date: key(date), completed: 0 }
  })
  const byDate = new Map(points.map((point) => [point.date, point]))
  for (const task of tasks) {
    if (task.status !== 'done' || !task.completedAt) continue
    const completedAt = new Date(task.completedAt)
    if (!Number.isNaN(completedAt.getTime())) byDate.get(key(completedAt))!.completed += 1
  }
  return points
}

function count<T>(items: T[], field: (item: T) => string): [string, number][] {
  const values = new Map<string, number>()
  for (const item of items) values.set(field(item), (values.get(field(item)) ?? 0) + 1)
  return [...values.entries()].sort((a, b) => b[1] - a[1])
}

function key(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
