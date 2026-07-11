import type { ApiTaskActivity } from '../../../lib/tasksApi'

const ACTION_META: Record<string, { icon: string; color: string }> = {
  created: { icon: '✨', color: 'text-[var(--bp-accent)]' },
  updated: { icon: '📝', color: 'text-blue-300' },
  status_changed: { icon: '🔄', color: 'text-blue-300' },
  progress_updated: { icon: '📈', color: 'text-blue-300' },
  priority_changed: { icon: '⚡', color: 'text-amber-300' },
  due_date_changed: { icon: '📅', color: 'text-amber-300' },
  member_invited: { icon: '✉️', color: 'text-[var(--bp-accent)]' },
  member_joined: { icon: '🤝', color: 'text-green-300' },
  member_removed: { icon: '🚪', color: 'text-red-300' },
  role_changed: { icon: '🎭', color: 'text-blue-300' },
  ownership_transferred: { icon: '👑', color: 'text-amber-300' },
  comment_added: { icon: '💬', color: 'text-[var(--bp-accent)]' },
  subtask_completed: { icon: '✅', color: 'text-green-300' },
  subtask_updated: { icon: '☑️', color: 'text-blue-300' },
  subtask_added: { icon: '➕', color: 'text-blue-300' },
  reminder_updated: { icon: '🔔', color: 'text-amber-300' },
  label_added: { icon: '🏷', color: 'text-blue-300' },
  label_removed: { icon: '🏷', color: 'text-slate-400' },
}

function meta(action: string) {
  return ACTION_META[action] ?? { icon: '•', color: 'text-slate-400' }
}

function formatTitle(action: string) {
  return action
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

type Props = {
  activities: ApiTaskActivity[]
  limit?: number
}

/** Full collaboration activity feed. Newest first. */
export function ActivityTimeline({ activities, limit }: Props) {
  const sorted = [...activities].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )
  const shown = limit ? sorted.slice(0, limit) : sorted

  if (shown.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-slate-400">
        No activity yet. Changes will appear here.
      </p>
    )
  }

  return (
    <ol className="space-y-3">
      {shown.map((activity) => {
        const m = meta(activity.action)
        return (
          <li key={activity.id} className="flex gap-3">
            <span
              className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--bp-border)] bg-[var(--bp-surface-elevated)] text-xs ${m.color}`}
              aria-hidden
            >
              {m.icon}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-[var(--bp-text)]">{formatTitle(activity.action)}</p>
              <p className="truncate text-xs text-slate-400">{activity.description}</p>
              <p className="text-[10px] text-slate-500">{formatDateTime(activity.createdAt)}</p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
