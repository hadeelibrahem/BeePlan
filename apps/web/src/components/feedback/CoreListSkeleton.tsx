import { useEffect, useState } from 'react'

export function useDelayedSkeleton(loading: boolean, delay = 180) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (!loading) { setVisible(false); return }
    const timer = window.setTimeout(() => setVisible(true), delay)
    return () => window.clearTimeout(timer)
  }, [delay, loading])
  return visible
}

export function CoreListSkeleton({ variant = 'tasks', rows = 4 }: { variant?: 'tasks' | 'reminders' | 'focus'; rows?: number }) {
  const height = variant === 'reminders' ? 'h-40' : variant === 'focus' ? 'h-24' : 'h-16'
  return <div className={variant === 'reminders' ? 'grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3' : 'space-y-3'} aria-hidden>{Array.from({ length: rows }).map((_, index) => <div key={index} className={`${height} animate-pulse rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)]/70`} />)}</div>
}
