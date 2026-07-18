import type { ApiTask } from '../lib/tasksApi'

export function taskTimeTracking(task: Pick<ApiTask, 'estimatedHours' | 'spentHours' | 'remainingHours'>) {
  const format = (value: number | undefined) => Number.isFinite(value) ? `${value}h` : '—'
  return { estimated: format(task.estimatedHours), spent: format(task.spentHours), remaining: format(task.remainingHours) }
}
