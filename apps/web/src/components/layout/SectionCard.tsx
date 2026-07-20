import type { ReactNode } from 'react'

type SectionCardProps = {
  children: ReactNode
  className?: string
}

export function SectionCard({ children, className = '' }: SectionCardProps) {
  // Shared layout scale: compact p-3, standard p-4 (this card), roomy p-5; cards use rounded-2xl.
  return (
    <section className={`rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-4 shadow-xl ${className}`}>
      {children}
    </section>
  )
}
