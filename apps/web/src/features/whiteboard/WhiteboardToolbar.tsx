import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import type { Editor } from 'tldraw'
import { GeoShapeGeoStyle } from '@tldraw/tlschema'

type Props = {
  editor: Editor | null
  onTaskClick?: () => void
  taskOpen?: boolean
  onUpload?: (files: File[]) => void
  uploading?: boolean
  onLinkClick?: () => void
  linkOpen?: boolean
}

const geometryTools = [
  { id: 'rectangle', label: 'Rectangle' },
  { id: 'ellipse', label: 'Ellipse' },
  { id: 'triangle', label: 'Triangle' },
  { id: 'line', label: 'Line' },
  { id: 'arrow', label: 'Arrow' },
] as const

export function WhiteboardToolbar({ editor, onTaskClick, taskOpen = false, onUpload, uploading = false, onLinkClick, linkOpen = false }: Props) {
  const [activeTool, setActiveTool] = useState<string | null>(null)
  const [shapesOpen, setShapesOpen] = useState(false)
  const shapesRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editor) {
      setActiveTool(null)
      return
    }
    const sync = () => setActiveTool(editor.getCurrentToolId())
    sync()
    const unlisten = editor.store.listen(sync)
    return () => unlisten()
  }, [editor])

  useEffect(() => {
    if (!shapesOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShapesOpen(false)
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!shapesRef.current?.contains(event.target as Node)) setShapesOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('pointerdown', onPointerDown)
    }
  }, [shapesOpen])

  const activate = (tool: string) => {
    editor?.setCurrentTool(tool)
  }

  const activateGeometry = (shape: (typeof geometryTools)[number]['id']) => {
    if (!editor) return
    if (shape === 'line' || shape === 'arrow') {
      editor.setCurrentTool(shape)
    } else {
      editor.setStyleForNextShapes(GeoShapeGeoStyle, shape)
      editor.setCurrentTool('geo')
    }
    setShapesOpen(false)
  }

  const handleFileSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.currentTarget.files
    if (files?.length) onUpload?.(Array.from(files))
    event.currentTarget.value = ''
  }

  const buttonClass = (active: boolean, disabled = false) => `rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${active ? 'border-[var(--bp-accent)] bg-[var(--bp-accent-soft)] text-[var(--bp-accent)]' : 'border-transparent text-[var(--bp-muted)] hover:border-[var(--bp-border)] hover:text-[var(--bp-text)]'} ${disabled ? 'cursor-not-allowed opacity-50' : ''}`

  return (
    <div aria-label="Whiteboard toolbar" className="relative z-10 flex shrink-0 flex-wrap items-center gap-2 rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-2" role="toolbar">
      <button type="button" disabled={!editor} aria-pressed={activeTool === 'select'} onClick={() => activate('select')} className={buttonClass(activeTool === 'select', !editor)}>Select</button>
      <button type="button" disabled={!editor} aria-pressed={activeTool === 'draw'} onClick={() => activate('draw')} className={buttonClass(activeTool === 'draw', !editor)}>Draw</button>
      <button type="button" disabled={!editor} aria-pressed={activeTool === 'text'} onClick={() => activate('text')} className={buttonClass(activeTool === 'text', !editor)}>Text</button>
      <div ref={shapesRef} className="relative">
        <button type="button" disabled={!editor} aria-expanded={shapesOpen} aria-haspopup="menu" aria-pressed={shapesOpen || activeTool === 'geo' || activeTool === 'line' || activeTool === 'arrow'} onClick={() => setShapesOpen((open) => !open)} className={buttonClass(shapesOpen || activeTool === 'geo' || activeTool === 'line' || activeTool === 'arrow', !editor)}>Shapes</button>
        {shapesOpen && editor && <div role="menu" aria-label="Shape tools" className="absolute start-0 top-full z-30 mt-2 min-w-36 rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-1 shadow-xl">
          {geometryTools.map((shape) => <button key={shape.id} type="button" role="menuitem" onClick={() => activateGeometry(shape.id)} className="block w-full rounded-lg px-3 py-2 text-start text-sm text-[var(--bp-text)] hover:bg-[var(--bp-accent-soft)]">{shape.label}</button>)}
        </div>}
      </div>
      <button type="button" aria-pressed={taskOpen} onClick={onTaskClick} className={buttonClass(taskOpen)}>Task</button>
      <button type="button" disabled={!editor} aria-pressed={linkOpen} onClick={onLinkClick} className={buttonClass(linkOpen, !editor)}>Link</button>
      <input ref={fileInputRef} type="file" className="hidden" accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.sheet,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain" multiple onChange={handleFileSelection} />
      <button type="button" disabled={!editor || uploading} onClick={() => fileInputRef.current?.click()} className={buttonClass(false, !editor || uploading)}>{uploading ? 'Uploading...' : 'Upload'}</button>
    </div>
  )
}
