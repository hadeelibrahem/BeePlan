import { BaseBoxShapeUtil, HTMLContainer, Rectangle2d, T, useEditor, type TLShape } from 'tldraw'
import type { MouseEvent, PointerEvent } from 'react'
import { useEffect, useState } from 'react'
import { useWhiteboardLinkContext } from './WhiteboardLinkContext'
import { whiteboardUrlLabel } from './whiteboardLinkUtils'

export const BEEPLAN_LINK_SHAPE_TYPE = 'beeplan-link' as const

declare module '@tldraw/tlschema' {
  interface TLGlobalShapePropsMap {
    'beeplan-link': { url: string; title: string; w: number; h: number }
  }
}

type BeePlanLinkShape = TLShape<typeof BEEPLAN_LINK_SHAPE_TYPE>

export class BeePlanLinkShapeUtil extends BaseBoxShapeUtil<BeePlanLinkShape> {
  static override type = BEEPLAN_LINK_SHAPE_TYPE
  static override props = { url: T.string, title: T.string, w: T.number, h: T.number }
  override getDefaultProps(): BeePlanLinkShape['props'] { return { url: 'https://example.com', title: '', w: 300, h: 150 } }
  override getGeometry(shape: BeePlanLinkShape) { return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true }) }
  override canResize() { return true }
  override isAspectRatioLocked() { return false }
  override component(shape: BeePlanLinkShape) {
    const context = useWhiteboardLinkContext()
    const editor = useEditor()
    const [isSelected, setIsSelected] = useState(() => editor.getSelectedShapeIds().includes(shape.id))
    useEffect(() => {
      const syncSelection = () => setIsSelected(editor.getSelectedShapeIds().includes(shape.id))
      syncSelection()
      return editor.store.listen(syncSelection)
    }, [editor, shape.id])
    const domain = whiteboardUrlLabel(shape.props.url)
    const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => { event.stopPropagation(); editor.markEventAsHandled(event) }
    const handleClick = (event: MouseEvent<HTMLButtonElement>, action: () => void) => { event.stopPropagation(); editor.markEventAsHandled(event); action() }
    return <HTMLContainer className="pointer-events-none"><article className="flex h-full flex-col rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-4 text-[var(--bp-text)] shadow-lg"><div className="flex items-center gap-2 text-xs text-[var(--bp-muted)]"><span className="text-lg">🔗</span><span className="truncate">{domain}</span></div><h3 className="mt-3 line-clamp-2 text-sm font-bold">{shape.props.title || domain}</h3><p className="mt-1 truncate text-xs text-[var(--bp-muted)]">{shape.props.url}</p>{isSelected && <div className="pointer-events-auto mt-auto flex flex-wrap gap-2 pt-3"><button type="button" onPointerDown={handlePointerDown} onClick={(event) => handleClick(event, () => context?.onOpen(shape.props.url))} className="rounded-lg bg-[var(--bp-accent)] px-2 py-1.5 text-xs font-semibold text-[var(--bp-accent-text)]">Open</button><button type="button" onPointerDown={handlePointerDown} onClick={(event) => handleClick(event, () => void context?.onCopy(shape.props.url))} className="rounded-lg border border-[var(--bp-border)] px-2 py-1.5 text-xs font-semibold">Copy</button><button type="button" onPointerDown={handlePointerDown} onClick={(event) => handleClick(event, () => context?.onEdit(shape.id, shape.props.url, shape.props.title))} className="rounded-lg border border-[var(--bp-border)] px-2 py-1.5 text-xs font-semibold">Edit</button></div>}</article></HTMLContainer>
  }
  override getIndicatorPath(shape: BeePlanLinkShape) { const path = new Path2D(); path.roundRect(0, 0, shape.props.w, shape.props.h, 12); return path }
}
