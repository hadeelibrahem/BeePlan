import { createContext, useCallback, useContext, useEffect, useState, type PropsWithChildren } from 'react'

type ToastTone = 'success' | 'error' | 'info'
type ToastInput = { message: string; tone?: ToastTone; actionLabel?: string; onAction?: () => void }
type ToastItem = ToastInput & { id: number }

type ToastContextValue = { showToast: (toast: ToastInput) => void }
const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: PropsWithChildren) {
  const [toast, setToast] = useState<ToastItem | null>(null)
  const showToast = useCallback((next: ToastInput) => setToast({ ...next, id: Date.now() }), [])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast((current) => (current?.id === toast.id ? null : current)), 3600)
    return () => window.clearTimeout(timer)
  }, [toast])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[70] flex justify-center px-4" aria-live="polite" aria-atomic="true">
        {toast ? (
          <div role={toast.tone === 'error' ? 'alert' : 'status'} className={`pointer-events-auto flex max-w-md items-center gap-3 rounded-xl border px-4 py-3 text-sm font-semibold shadow-2xl ${toast.tone === 'error' ? 'border-red-500/30 bg-red-500/15 text-red-100' : toast.tone === 'success' ? 'border-green-500/30 bg-green-500/15 text-green-100' : 'border-blue-500/30 bg-blue-500/15 text-blue-100'}`}>
            <span>{toast.message}</span>
            {toast.actionLabel && toast.onAction ? <button type="button" onClick={toast.onAction} className="rounded-md underline underline-offset-2">{toast.actionLabel}</button> : null}
          </div>
        ) : null}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside ToastProvider')
  return context
}
