import type { ReactNode } from 'react'

type StatsCardProps = {
  icon: ReactNode
  value: string
  title: string
  desc: string
}

export function StatsCard({ icon, value, title, desc }: StatsCardProps) {
  return (
    <div className="animate-[beeplanFadeIn_300ms_ease-out] rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-6 shadow-xl transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--bp-accent)]/40">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--bp-accent)]/15 text-[var(--bp-accent)]">
        {icon}
      </div>
      <div className="text-3xl font-black text-[var(--bp-text)]">{value}</div>
      <h3 className="mt-2 font-bold text-[var(--bp-text)]">{title}</h3>
      <p className="mt-2 text-sm text-slate-400">{desc}</p>
    </div>
  )
}
