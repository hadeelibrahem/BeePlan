import type { ReactNode } from 'react'

type EmptyStateProps = {
  icon?: ReactNode
  illustration?: ReactNode
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
  variant?: 'first-run' | 'filtered' | 'informational'
  size?: 'sm' | 'md' | 'lg'
}

const SIZE_CLASSES = { sm: 'py-6', md: 'py-10', lg: 'py-14' }

export function EmptyState({ icon, illustration, title, description, actionLabel, onAction, variant = 'informational', size = 'md' }: EmptyStateProps) {
  const visual = illustration ?? icon
  const isFiltered = variant === 'filtered'
  return (
    <div data-empty-variant={variant} className={`flex flex-col items-center justify-center gap-3 rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] px-4 text-center ${SIZE_CLASSES[size]}`}>
      {visual ? <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${isFiltered ? 'bg-[var(--bp-border)] text-[var(--bp-muted)]' : 'bg-[var(--bp-accent)]/15 text-[var(--bp-accent)]'}`}>{visual}</div> : null}
      <div>
        <p className="mb-1 text-sm font-semibold text-[var(--bp-text)]">{title}</p>
        <p className="max-w-sm text-xs text-[var(--bp-muted)]">{description}</p>
      </div>
      {!isFiltered && actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="rounded-lg bg-[var(--bp-accent)] px-4 py-2 text-sm font-black text-[var(--bp-accent-text)] transition hover:brightness-95 active:scale-95"
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}
