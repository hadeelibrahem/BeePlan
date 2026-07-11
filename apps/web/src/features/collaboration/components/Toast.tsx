import { useEffect } from 'react'

type Props = {
  message: string
  tone?: 'success' | 'error'
  duration?: number
  onDone: () => void
}

/**
 * Lightweight transient toast (bottom-center). Auto-dismisses. Uses a keyframe
 * defined inline so it needs no global CSS changes. Announced politely to
 * screen readers.
 */
export function Toast({ message, tone = 'success', duration = 3200, onDone }: Props) {
  useEffect(() => {
    if (!message) return
    const timer = setTimeout(onDone, duration)
    return () => clearTimeout(timer)
  }, [message, duration, onDone])

  if (!message) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4"
      style={{ animation: 'bpToastIn 200ms ease-out' }}
    >
      <div
        className={`pointer-events-auto max-w-sm rounded-xl border px-4 py-2.5 text-sm font-semibold shadow-2xl backdrop-blur ${
          tone === 'success'
            ? 'border-green-500/30 bg-green-500/15 text-green-200'
            : 'border-red-500/30 bg-red-500/15 text-red-200'
        }`}
      >
        {tone === 'success' ? '✓ ' : '⚠ '}
        {message}
      </div>
      <style>{`@keyframes bpToastIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  )
}
