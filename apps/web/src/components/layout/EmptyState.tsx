import type { ReactNode } from 'react'

type EmptyStateProps = {
  icon: ReactNode
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
}

export function EmptyState({ icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-[20px] border border-[var(--bp-border)] bg-[var(--bp-surface)] py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--bp-accent)]/15 text-[var(--bp-accent)]">{icon}</div>
      <div>
        <p className="mb-1 text-sm font-semibold text-[var(--bp-text)]">{title}</p>
        <p className="max-w-sm text-xs text-slate-400">{description}</p>
      </div>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="rounded-xl bg-[var(--bp-accent)] px-5 py-3 text-sm font-black text-[var(--bp-accent-text)] transition hover:brightness-95 active:scale-95"
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}
