import { ROLE_META } from '../api/collaboration.api'
import type { TaskRole } from '../types'

type SharedBadgeProps = {
  memberCount?: number
  className?: string
}

/**
 * "👥 Shared" pill for task cards and headers. Renders nothing for personal
 * tasks — callers guard on `task.isShared` before mounting it, but the count
 * label is only shown when a meaningful (>0) count is supplied.
 */
export function SharedBadge({ memberCount, className = '' }: SharedBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-[var(--bp-accent)]/30 bg-[var(--bp-accent)]/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[var(--bp-accent)] ${className}`}
      aria-label={
        memberCount ? `Shared task with ${memberCount} members` : 'Shared task'
      }
    >
      <span aria-hidden>👥</span>
      Shared
      {memberCount ? <span className="opacity-80">· {memberCount}</span> : null}
    </span>
  )
}

type RoleBadgeProps = {
  role: TaskRole
  className?: string
}

export function RoleBadge({ role, className = '' }: RoleBadgeProps) {
  const meta = ROLE_META[role]
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-[var(--bp-border)] bg-[var(--bp-surface)] px-2 py-0.5 text-[10px] font-bold text-[var(--bp-text)] ${className}`}
    >
      <span aria-hidden>{meta.icon}</span>
      {meta.label}
    </span>
  )
}
