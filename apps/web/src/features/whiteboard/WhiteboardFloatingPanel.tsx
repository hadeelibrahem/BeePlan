import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'

type Position = { x: number; y: number }
type InitialPosition = Position | ((container: { width: number; height: number }) => Position)

type Props = {
  id: string
  title: string
  children: ReactNode
  initialPosition?: InitialPosition
  className?: string
  onClose?: () => void
  closeLabel?: string
  defaultCollapsed?: boolean
}

const STORAGE_PREFIX = 'beeplan:whiteboard:panel:'
let nextZIndex = 40

function readSavedState(id: string) {
  try {
    const value = sessionStorage.getItem(`${STORAGE_PREFIX}${id}`)
    if (!value) return null
    const parsed = JSON.parse(value) as { position?: Position; collapsed?: boolean }
    if (!parsed.position || !Number.isFinite(parsed.position.x) || !Number.isFinite(parsed.position.y)) return null
    return { position: parsed.position, collapsed: Boolean(parsed.collapsed) }
  } catch {
    return null
  }
}

function saveState(id: string, position: Position, collapsed: boolean) {
  try { sessionStorage.setItem(`${STORAGE_PREFIX}${id}`, JSON.stringify({ position, collapsed })) } catch { /* storage is optional */ }
}

export function WhiteboardFloatingPanel({ id, title, children, initialPosition = { x: 16, y: 16 }, className = '', onClose, closeLabel = `Close ${title}`, defaultCollapsed = false }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null)
  const saved = useRef(readSavedState(id))
  const [position, setPosition] = useState<Position>(() => saved.current?.position ?? { x: 16, y: 16 })
  const [collapsed, setCollapsed] = useState(() => saved.current?.collapsed ?? defaultCollapsed)
  const [zIndex, setZIndex] = useState(() => ++nextZIndex)

  const calculateInitialPosition = useCallback(() => {
    const parent = panelRef.current?.parentElement
    if (!parent || saved.current?.position) return
    const rect = parent.getBoundingClientRect()
    const next = typeof initialPosition === 'function' ? initialPosition({ width: rect.width, height: rect.height }) : initialPosition
    setPosition(next)
  }, [initialPosition])

  const clampPosition = useCallback(() => {
    const parent = panelRef.current?.parentElement
    const panel = panelRef.current
    if (!parent || !panel) return
    const maxX = Math.max(0, parent.clientWidth - panel.offsetWidth - 8)
    const maxY = Math.max(0, parent.clientHeight - panel.offsetHeight - 8)
    setPosition((current) => ({ x: Math.min(Math.max(8, current.x), maxX), y: Math.min(Math.max(8, current.y), maxY) }))
  }, [])

  useLayoutEffect(() => { calculateInitialPosition() }, [calculateInitialPosition])
  useLayoutEffect(() => {
    const parent = panelRef.current?.parentElement
    const panel = panelRef.current
    if (!parent || !panel) return
    const maxX = Math.max(0, parent.clientWidth - panel.offsetWidth - 8)
    const maxY = Math.max(0, parent.clientHeight - panel.offsetHeight - 8)
    setPosition((current) => {
      const next = { x: Math.min(Math.max(8, current.x), maxX), y: Math.min(Math.max(8, current.y), maxY) }
      return next.x === current.x && next.y === current.y ? current : next
    })
  }, [position])
  useEffect(() => {
    const onResize = () => clampPosition()
    window.addEventListener('resize', onResize)
    const parent = panelRef.current?.parentElement
    const observer = typeof ResizeObserver !== 'undefined' && parent ? new ResizeObserver(onResize) : null
    observer?.observe(parent!)
    return () => { window.removeEventListener('resize', onResize); observer?.disconnect() }
  }, [clampPosition])
  useEffect(() => { saveState(id, position, collapsed) }, [id, position, collapsed])

  const bringToFront = () => setZIndex(++nextZIndex)
  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button, input, textarea, select, a')) return
    const panel = panelRef.current
    if (!panel) return
    const rect = panel.getBoundingClientRect()
    dragRef.current = { pointerId: event.pointerId, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.stopPropagation()
    bringToFront()
  }
  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const parent = panelRef.current?.parentElement
    const rect = parent?.getBoundingClientRect()
    if (!rect) return
    setPosition({ x: event.clientX - rect.left - drag.offsetX, y: event.clientY - rect.top - drag.offsetY })
    event.stopPropagation()
  }
  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    clampPosition()
    event.stopPropagation()
  }

  return <section ref={panelRef} role="region" aria-label={title} className={`absolute max-w-[calc(100%-1rem)] overflow-hidden rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] text-[var(--bp-text)] shadow-2xl ${className}`} style={{ left: position.x, top: position.y, zIndex }} onPointerDown={bringToFront}>
    <div className="flex min-h-10 cursor-move select-none items-center justify-between gap-3 border-b border-[var(--bp-border)] px-3 py-2 text-sm font-semibold" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
      <span className="truncate">{title}</span>
      <div className="flex shrink-0 items-center gap-1">
        <button type="button" aria-label={collapsed ? `Restore ${title}` : `Minimize ${title}`} onClick={() => setCollapsed((value) => !value)} className="rounded-md px-2 py-1 text-xs text-[var(--bp-muted)] hover:bg-[var(--bp-accent-soft)]">{collapsed ? '□' : '—'}</button>
        {onClose && <button type="button" aria-label={closeLabel} onClick={onClose} className="rounded-md px-2 py-1 text-base leading-none text-[var(--bp-muted)] hover:bg-[var(--bp-accent-soft)]">×</button>}
      </div>
    </div>
    {!collapsed && <div className="min-h-0">{children}</div>}
  </section>
}
