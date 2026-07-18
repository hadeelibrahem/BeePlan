import type { ReactNode } from 'react'

type StatsCardProps = {
  icon: ReactNode
  value: string
  title: string
  desc: string
}

export function StatsCard({ icon, value, title, desc }: StatsCardProps) {
  return (
    <div className="animate-[beeplanFadeIn_300ms_ease-out] rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-4 shadow-xl transition-colors duration-200">
      <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--bp-accent)]/15 text-[var(--bp-accent)]">
        {icon}
      </div>
      <div className="text-2xl font-black text-[var(--bp-text)]">{value}</div>
      <h3 className="mt-1.5 text-sm font-bold text-[var(--bp-text)]">{title}</h3>
      <p className="mt-1 text-xs text-[var(--bp-muted)]">{desc}</p>
    </div>
  )
}
