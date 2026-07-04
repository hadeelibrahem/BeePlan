import type { ReactNode } from 'react'

type SectionCardProps = {
  children: ReactNode
  className?: string
}

export function SectionCard({ children, className = '' }: SectionCardProps) {
  return (
    <section className={`rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-4 shadow-xl ${className}`}>
      {children}
    </section>
  )
}
