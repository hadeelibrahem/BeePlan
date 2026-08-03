import type { ReactNode } from 'react'

type StatsCardProps = {
  icon: ReactNode
  value: ReactNode
  title: string
  desc: string
}

export function StatsCard({ icon, value, title, desc }: StatsCardProps) {
  return (
    <div className="bp-card animate-[beeplanFadeIn_300ms_ease-out] rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] px-3 py-2.5 shadow-lg transition-colors duration-200">
      <div className="mb-1.5 flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--bp-accent)]/12 text-[var(--bp-accent-ink)]">
        {icon}
      </div>
      <div className="text-xl font-black text-[var(--bp-text)]">{value}</div>
      <h3 className="mt-0.5 text-xs font-bold text-[var(--bp-text)]">{title}</h3>
      <p className="mt-0.5 text-[11px] text-[var(--bp-muted)]">{desc}</p>
    </div>
  )
}
