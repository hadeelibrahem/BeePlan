import { useEffect, useMemo, useState } from 'react'
import type { Editor, TLShape } from 'tldraw'
import { WhiteboardFloatingPanel } from './WhiteboardFloatingPanel'

type Props = { editor: Editor | null; readOnly?: boolean }

function isTypingTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null
  return Boolean(element?.closest('input, textarea, [contenteditable="true"], [role="dialog"]'))
}

export function WhiteboardAdvancedControls({ editor, readOnly = false }: Props) {
  const [selected, setSelected] = useState<TLShape[]>([])
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [minimapOpen, setMinimapOpen] = useState(false)
  const [snapOpen, setSnapOpen] = useState(false)
  const [, rerender] = useState(0)

  useEffect(() => {
    if (!editor) return
    const sync = () => { setSelected(editor.getSelectedShapes()); rerender((value) => value + 1) }
    sync()
    return editor.store.listen(sync)
  }, [editor])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!editor || isTypingTarget(event.target)) return
      const accel = event.ctrlKey || event.metaKey
      if (accel && event.key.toLowerCase() === 'f') { event.preventDefault(); setSearchOpen(true); return }
      if (event.key === 'Escape') { setSearchOpen(false); setMoreOpen(false); editor.selectNone(); return }
      if (readOnly || !selected.length) return
      if (event.key === 'Delete' || event.key === 'Backspace') { editor.deleteShapes(selected); return }
      if (accel && event.key.toLowerCase() === 'd') { event.preventDefault(); editor.duplicateShapes(selected, { x: 16, y: 16 }); return }
      if (accel && event.key.toLowerCase() === 'g') { event.preventDefault(); event.shiftKey ? editor.ungroupShapes(selected) : editor.groupShapes(selected); return }
      if (event.key === '+' || event.key === '=') { event.preventDefault(); editor.zoomIn(); return }
      if (event.key === '-') { event.preventDefault(); editor.zoomOut(); return }
      if (event.key === '0') { event.preventDefault(); editor.resetZoom() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [editor, readOnly, selected])

  const results = useMemo(() => {
    if (!editor || !query.trim()) return []
    const needle = query.trim().toLocaleLowerCase()
    return editor.getCurrentPageShapes().filter((shape) => JSON.stringify(shape.props).toLocaleLowerCase().includes(needle)).slice(0, 20)
  }, [editor, query, selected])

  const run = (action: () => void) => { action(); setMoreOpen(false) }
  if (!editor) return null

  return <>
    <WhiteboardFloatingPanel id="zoom-controls" title="Whiteboard controls" initialPosition={({ width }) => ({ x: Math.max(8, width - 330), y: 16 })} className="w-fit">
      <div className="flex max-w-[calc(100vw-1rem)] flex-wrap items-center gap-2 p-2">
        <button type="button" aria-label="Search board" onClick={() => setSearchOpen((value) => !value)} className="rounded-lg border border-[var(--bp-border)] px-2 py-1 text-xs text-[var(--bp-text)]">Search</button>
        <button type="button" aria-label="Zoom out" onClick={() => editor.zoomOut()} className="rounded-lg px-2 py-1 text-sm text-[var(--bp-text)]">−</button>
        <span className="min-w-10 text-center text-xs text-[var(--bp-muted)]">{Math.round(editor.getZoomLevel() * 100)}%</span>
        <button type="button" aria-label="Zoom in" onClick={() => editor.zoomIn()} className="rounded-lg px-2 py-1 text-sm text-[var(--bp-text)]">+</button>
        <button type="button" aria-label="Zoom to fit" onClick={() => editor.zoomToFit()} className="rounded-lg px-2 py-1 text-xs text-[var(--bp-text)]">Fit</button>
        <button type="button" aria-label="More whiteboard actions" onClick={() => setMoreOpen((value) => !value)} className="rounded-lg px-2 py-1 text-sm text-[var(--bp-text)]">⋯</button>
        {moreOpen && <div className="absolute end-0 top-full mt-2 flex min-w-44 flex-col gap-1 rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-2 shadow-xl">
          <button type="button" onClick={() => run(() => editor.bringToFront(selected))} disabled={!selected.length} className="rounded-lg px-3 py-2 text-start text-xs text-[var(--bp-text)] disabled:opacity-40">Bring to front</button>
          <button type="button" onClick={() => run(() => editor.sendToBack(selected))} disabled={!selected.length} className="rounded-lg px-3 py-2 text-start text-xs text-[var(--bp-text)] disabled:opacity-40">Send to back</button>
          <button type="button" onClick={() => run(() => editor.toggleLock(selected))} disabled={!selected.length} className="rounded-lg px-3 py-2 text-start text-xs text-[var(--bp-text)] disabled:opacity-40">Lock / unlock</button>
          <button type="button" onClick={() => { setSnapOpen((value) => !value); editor.updateInstanceState({ isGridMode: !snapOpen }); setMoreOpen(false) }} className="rounded-lg px-3 py-2 text-start text-xs text-[var(--bp-text)]">Snap to grid: {snapOpen ? 'On' : 'Off'}</button>
          <button type="button" onClick={() => run(() => setMinimapOpen((value) => !value))} className="rounded-lg px-3 py-2 text-start text-xs text-[var(--bp-text)]">{minimapOpen ? 'Hide' : 'Show'} mini-map</button>
          <button type="button" onClick={() => { if (window.confirm('Remove all elements from this Whiteboard?')) run(() => editor.deleteShapes(editor.getCurrentPageShapes())) }} className="rounded-lg px-3 py-2 text-start text-xs text-[var(--bp-text)]">Clear board</button>
        </div>}
      </div>
    </WhiteboardFloatingPanel>
    {searchOpen && <WhiteboardFloatingPanel id="board-search" title="Search board" onClose={() => setSearchOpen(false)} className="w-72" initialPosition={({ width }) => ({ x: Math.max(8, width - 300), y: 120 })}>
      <div className="p-2">
        <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search this board" aria-label="Search this board" className="w-full rounded-lg border border-[var(--bp-border)] bg-transparent px-3 py-2 text-sm text-[var(--bp-text)] outline-none" />
        <div className="mt-2 max-h-48 overflow-auto">{results.map((shape) => <button key={shape.id} type="button" onClick={() => { editor.select(shape.id); editor.zoomToSelection({ animation: { duration: 180 } }); setSearchOpen(false) }} className="block w-full truncate rounded-lg px-3 py-2 text-start text-xs text-[var(--bp-text)] hover:bg-[var(--bp-accent-soft)]">{shape.type} · {JSON.stringify(shape.props).slice(0, 80)}</button>)}{query && !results.length && <p className="px-3 py-2 text-xs text-[var(--bp-muted)]">No matching board items</p>}</div>
      </div>
    </WhiteboardFloatingPanel>}
    {selected.length > 0 && !readOnly && <WhiteboardFloatingPanel id="selection-actions" title={`${selected.length} selected`} className="w-max" initialPosition={({ width, height }) => ({ x: Math.max(8, width / 2 - 140), y: Math.max(8, height - 64) })}>
      <div className="flex flex-wrap items-center gap-1 p-2" aria-label="Selection actions">
        {selected.length > 1 && <><button type="button" onClick={() => editor.groupShapes(selected)} className="rounded-lg px-2 py-1 text-xs text-[var(--bp-text)]">Group</button><button type="button" onClick={() => editor.alignShapes(selected, 'center-horizontal')} className="rounded-lg px-2 py-1 text-xs text-[var(--bp-text)]">Align</button></>}
        <button type="button" onClick={() => editor.duplicateShapes(selected, { x: 16, y: 16 })} className="rounded-lg px-2 py-1 text-xs text-[var(--bp-text)]">Duplicate</button>
        <button type="button" onClick={() => editor.toggleLock(selected)} className="rounded-lg px-2 py-1 text-xs text-[var(--bp-text)]">Lock</button>
        <button type="button" onClick={() => editor.deleteShapes(selected)} className="rounded-lg px-2 py-1 text-xs text-[var(--bp-text)]">Delete</button>
      </div>
    </WhiteboardFloatingPanel>}
    {minimapOpen && <MiniMap editor={editor} />}
  </>
}

function MiniMap({ editor }: { editor: Editor }) {
  const shapes = editor.getCurrentPageShapes()
  if (!shapes.length) return null
  const boxes = shapes.map((shape) => editor.getShapePageBounds(shape)).filter((box): box is NonNullable<typeof box> => Boolean(box))
  if (!boxes.length) return null
  const minX = Math.min(...boxes.map((box) => box.minX)); const minY = Math.min(...boxes.map((box) => box.minY)); const maxX = Math.max(...boxes.map((box) => box.maxX)); const maxY = Math.max(...boxes.map((box) => box.maxY))
  const bounds = { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
  const width = 180; const height = 120
  return <WhiteboardFloatingPanel id="minimap" title="Mini-map" className="w-[180px]" initialPosition={({ width, height }) => ({ x: Math.max(8, width - 196), y: Math.max(8, height - 144) })}>
    <button type="button" aria-label="Mini-map" onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); editor.centerOnPoint({ x: bounds.minX + ((event.clientX - rect.left) / width) * bounds.width, y: bounds.minY + ((event.clientY - rect.top) / height) * bounds.height }) }} className="relative block h-[120px] w-[180px] overflow-hidden bg-[var(--bp-surface)]/95">
      {shapes.map((shape) => { const box = editor.getShapePageBounds(shape); if (!box) return null; return <span key={shape.id} className="absolute rounded-sm bg-[var(--bp-accent)]/60" style={{ left: `${((box.minX - bounds.minX) / Math.max(bounds.width, 1)) * 100}%`, top: `${((box.minY - bounds.minY) / Math.max(bounds.height, 1)) * 100}%`, width: `${Math.max((box.width / Math.max(bounds.width, 1)) * 100, 1)}%`, height: `${Math.max((box.height / Math.max(bounds.height, 1)) * 100, 1)}%` }} /> })}
    </button>
  </WhiteboardFloatingPanel>
}
