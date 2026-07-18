import { useEffect, useId, useRef, type PropsWithChildren, type ReactNode, type RefObject } from 'react'

type Props = PropsWithChildren<{ open: boolean; title: string; description?: string; footer?: ReactNode; onClose: () => void; initialFocusRef?: RefObject<HTMLElement | null>; size?: 'sm' | 'md' }>

export function Modal({ open, title, description, footer, onClose, initialFocusRef, size = 'sm', children }: Props) {
  const titleId = useId(); const descriptionId = useId(); const dialogRef = useRef<HTMLDivElement>(null); const previousFocus = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (!open) return
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'
    const focus = () => initialFocusRef?.current?.focus() ?? dialogRef.current?.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')?.focus()
    requestAnimationFrame(focus)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
      if (event.key !== 'Tab') return
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])
      if (!focusable.length) return
      const first = focusable[0]; const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', onKeyDown); previousFocus.current?.focus() }
  }, [initialFocusRef, onClose, open])
  if (!open) return null
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} className={`max-h-[calc(100vh-2rem)] w-full overflow-y-auto rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-5 shadow-2xl ${size === 'md' ? 'max-w-2xl' : 'max-w-sm'}`}><div className="flex items-start justify-between gap-4"><div><h2 id={titleId} className="text-lg font-black text-[var(--bp-text)]">{title}</h2>{description ? <p id={descriptionId} className="mt-2 text-sm text-[var(--bp-muted)]">{description}</p> : null}</div><button type="button" aria-label="Close dialog" onClick={onClose} className="text-[var(--bp-muted)]">x</button></div>{children}{footer ? <div className="mt-5 flex justify-end gap-3">{footer}</div> : null}</div></div>
}
