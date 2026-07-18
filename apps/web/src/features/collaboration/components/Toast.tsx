import { useEffect } from 'react'
import { useToast } from '../../../components/feedback/ToastProvider'

type Props = {
  message: string
  tone?: 'success' | 'error'
  duration?: number
  onDone: () => void
}

/** Compatibility adapter for collaboration callers during the toast migration. */
export function Toast({ message, tone = 'success', duration = 3200, onDone }: Props) {
  const { showToast } = useToast()

  useEffect(() => {
    if (!message) return
    showToast({ message, tone })
    const timer = window.setTimeout(onDone, duration)
    return () => window.clearTimeout(timer)
  }, [duration, message, onDone, showToast, tone])

  return null
}
