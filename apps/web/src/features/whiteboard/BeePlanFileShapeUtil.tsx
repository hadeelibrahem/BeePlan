import { BaseBoxShapeUtil, HTMLContainer, Rectangle2d, T, type TLShape } from 'tldraw'
import { useWhiteboardAssetContext } from './WhiteboardAssetContext'

export const BEEPLAN_FILE_SHAPE_TYPE = 'beeplan-file' as const

declare module '@tldraw/tlschema' {
  interface TLGlobalShapePropsMap {
    'beeplan-file': { assetId: string; w: number; h: number }
  }
}

type BeePlanFileShape = TLShape<typeof BEEPLAN_FILE_SHAPE_TYPE>

function humanSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export class BeePlanFileShapeUtil extends BaseBoxShapeUtil<BeePlanFileShape> {
  static override type = BEEPLAN_FILE_SHAPE_TYPE
  static override props = { assetId: T.string, w: T.number, h: T.number }

  override getDefaultProps(): BeePlanFileShape['props'] { return { assetId: '', w: 280, h: 150 } }
  override getGeometry(shape: BeePlanFileShape) { return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true }) }
  override canResize() { return true }
  override isAspectRatioLocked() { return false }
  override component(shape: BeePlanFileShape) {
    const context = useWhiteboardAssetContext()
    const asset = context?.assets.find((item) => item.id === shape.props.assetId)
    return <HTMLContainer className="pointer-events-auto"><article className="flex h-full flex-col rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-4 text-[var(--bp-text)] shadow-lg"><div className="text-2xl">📄</div>{!asset ? <><p className="mt-2 text-sm text-[var(--bp-muted)]">File no longer available</p><button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => context?.onRemoveShape(shape.id)} className="mt-auto self-start rounded-lg border border-[var(--bp-border)] px-2 py-1.5 text-xs font-semibold">Remove</button></> : <><h3 className="mt-2 line-clamp-2 text-sm font-bold">{asset.fileName}</h3><p className="mt-1 text-xs uppercase text-[var(--bp-muted)]">{asset.mimeType.split('/').pop()} · {humanSize(asset.size)}</p><div className="mt-auto flex gap-2 pt-3"><button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => void context?.onOpen(asset)} className="rounded-lg bg-[var(--bp-accent)] px-2 py-1.5 text-xs font-semibold text-[var(--bp-accent-text)]">Open</button></div></>}</article></HTMLContainer>
  }
  override getIndicatorPath(shape: BeePlanFileShape) { const path = new Path2D(); path.roundRect(0, 0, shape.props.w, shape.props.h, 12); return path }
}
