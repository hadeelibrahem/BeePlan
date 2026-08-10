import type { RandomStartItem } from '../../lib/tasksApi'

export type WheelMode = 'all' | 'pick' | 'filter'
export type WheelFilters = { priorities: string[]; due: string[]; durations: string[] }

export const EMPTY_FILTERS: WheelFilters = { priorities: [], due: [], durations: [] }

export function matchesFilters(task: RandomStartItem, filters: WheelFilters, now = new Date()) {
  if (filters.priorities.length && !filters.priorities.includes(task.priority === 'urgent' ? 'high' : task.priority)) return false
  if (filters.durations.length) {
    const minutes = task.estimatedTimeMinutes ?? 0
    const durationMatch = filters.durations.some((value) => value === 'under30' ? minutes > 0 && minutes < 30 : value === '30to60' ? minutes >= 30 && minutes <= 60 : minutes > 60)
    if (!durationMatch) return false
  }
  if (filters.due.length) {
    const due = task.dueDate ? new Date(task.dueDate) : null
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const end = new Date(start); end.setDate(end.getDate() + 7)
    const dueMatch = filters.due.some((value) => value === 'none' ? !due : value === 'today' ? Boolean(due && due >= start && due < new Date(start.getTime() + 86400000)) : Boolean(due && due >= start && due < end))
    if (!dueMatch) return false
  }
  return true
}

export function buildWheel(candidates: RandomStartItem[], mode: WheelMode, selected: Set<string>, filters: WheelFilters, excluded: Set<string>) {
  return candidates.filter((task) => !excluded.has(task.candidateKey) && (mode === 'all' || (mode === 'pick' ? selected.has(task.candidateKey) : matchesFilters(task, filters))))
}

export function pickRandom<T extends Pick<RandomStartItem, 'priority'>>(items: T[], weighted: boolean, random = Math.random): T | null {
  // Keep the established equal-segment renderer stable; weighting chooses the
  // result, then the animation rotates that exact segment to the pointer.
  if (!items.length) return null
  const weight = (item: T) => weighted ? (item.priority === 'urgent' || item.priority === 'high' ? 3 : item.priority === 'medium' ? 2 : 1) : 1
  const total = items.reduce((sum, item) => sum + weight(item), 0)
  let cursor = random() * total
  for (const item of items) { cursor -= weight(item); if (cursor < 0) return item }
  return items[items.length - 1]
}

export function isRtlLabel(value: string) { return /[\u0590-\u08FF]/.test(value) }
