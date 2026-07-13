import type { ApiSubtask, ApiSubtaskPriority, ApiSubtaskStatus } from './tasksApi'

// ---- Status ----

export const SUBTASK_STATUS_LABEL: Record<ApiSubtaskStatus, string> = {
  todo: 'Todo',
  in_progress: 'In Progress',
  done: 'Done',
  blocked: 'Blocked',
  missed: 'Missed',
}

export const SUBTASK_STATUS_CLASS: Record<ApiSubtaskStatus, string> = {
  todo: 'text-slate-400 bg-slate-400/10',
  in_progress: 'text-blue-400 bg-blue-400/10',
  done: 'text-green-400 bg-green-400/10',
  blocked: 'text-slate-300 bg-slate-500/20',
  missed: 'text-red-400 bg-red-400/10',
}

// ---- Priority ----

export const SUBTASK_PRIORITY_LABEL: Record<ApiSubtaskPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
}

export const SUBTASK_PRIORITY_CLASS: Record<ApiSubtaskPriority, string> = {
  low: 'text-green-400 bg-green-400/10',
  medium: 'text-orange-400 bg-orange-400/10',
  high: 'text-red-400 bg-red-400/10',
  urgent: 'text-red-300 bg-red-500/20',
}

// ---- Time indicator ----

export type SubtaskIndicator = 'overdue' | 'due-today' | 'upcoming' | 'completed' | 'blocked'

export const SUBTASK_INDICATOR_META: Record<
  SubtaskIndicator,
  { dot: string; label: string }
> = {
  overdue: { dot: 'bg-red-500', label: 'Overdue' },
  'due-today': { dot: 'bg-orange-500', label: 'Due Today' },
  upcoming: { dot: 'bg-blue-500', label: 'Upcoming' },
  completed: { dot: 'bg-green-500', label: 'Completed' },
  blocked: { dot: 'bg-slate-500', label: 'Blocked' },
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/** Derives the traffic-light indicator shown on the list row. */
export function getSubtaskIndicator(subtask: ApiSubtask, now: Date = new Date()): SubtaskIndicator {
  if (subtask.status === 'done' || subtask.isDone) return 'completed'
  if (subtask.status === 'blocked') return 'blocked'
  if (subtask.status === 'missed') return 'overdue'

  if (subtask.dueDate) {
    const due = new Date(subtask.dueDate)
    if (!Number.isNaN(due.getTime())) {
      if (isSameDay(due, now)) return 'due-today'
      if (due.getTime() < now.getTime()) return 'overdue'
    }
  }
  return 'upcoming'
}

// ---- Assignment / sharing ----

export type SubtaskAssignment = 'shared' | 'personal' | 'unassigned'

/** Derives the assignment kind from structural fields (never the title). */
export function getSubtaskAssignment(subtask: ApiSubtask): SubtaskAssignment {
  if (subtask.isShared) return 'shared'
  if (subtask.assigneeUserId) return 'personal'
  return 'unassigned'
}

/**
 * Strips a leading `Name:` prefix from a subtask's title when it matches the
 * subtask's own assignee display name (legacy plans embedded the assignee in
 * the title). Assignment is shown structurally instead. Titles with an
 * unrelated colon ("Chapter 3: …") are left intact.
 */
export function displaySubtaskTitle(subtask: ApiSubtask): string {
  const title = subtask.title?.trim() ?? ''
  const name = subtask.assignee?.trim()
  if (!name) return title
  const match = title.match(/^([^:]{1,60}):\s*(.+\S)\s*$/)
  if (match && match[1].trim().toLowerCase() === name.toLowerCase()) {
    return match[2].trim()
  }
  return title
}

// ---- Client-side visibility filter (over the already role-restricted list) ----

export type SubtaskFilter = 'mine' | 'team' | 'shared' | 'unassigned' | 'member'

export function matchesSubtaskFilter(
  subtask: ApiSubtask,
  filter: SubtaskFilter,
  ctx: { currentUserId?: string; memberId?: string },
): boolean {
  switch (filter) {
    case 'mine':
      return Boolean(ctx.currentUserId) && subtask.assigneeUserId === ctx.currentUserId
    case 'shared':
      return Boolean(subtask.isShared)
    case 'unassigned':
      return !subtask.isShared && !subtask.assigneeUserId
    case 'member':
      return Boolean(ctx.memberId) && subtask.assigneeUserId === ctx.memberId
    case 'team':
    default:
      return true
  }
}

/** "45 min", "1h 30m", or "" when unset. */
export function formatDuration(minutes?: number | null): string {
  if (!minutes || minutes <= 0) return ''
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

/** Warnings the UI surfaces on a subtask (parent-relative + capacity). */
export function getSubtaskWarnings(
  subtask: ApiSubtask,
  opts: { parentDueDate?: string; remainingParentMinutes?: number },
): string[] {
  const warnings: string[] = []

  if (subtask.dueDate && opts.parentDueDate) {
    const sub = new Date(subtask.dueDate).getTime()
    const parent = new Date(opts.parentDueDate).getTime()
    if (!Number.isNaN(sub) && !Number.isNaN(parent) && sub > parent) {
      warnings.push('Due after the parent task’s due date.')
    }
  }

  if (
    subtask.estimatedDurationMinutes &&
    opts.remainingParentMinutes !== undefined &&
    subtask.estimatedDurationMinutes > opts.remainingParentMinutes
  ) {
    warnings.push('Estimated time exceeds the remaining available time.')
  }

  return warnings
}
