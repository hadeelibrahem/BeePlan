import { API_BASE_URL } from '../../lib/api'

export function whiteboardAssetResolverUrl(assetId: string) {
  return `${API_BASE_URL}/whiteboard/assets/${assetId}/file`
}

export const WHITEBOARD_IMAGE_UNAVAILABLE_URL = '/whiteboard-image-unavailable.svg'

/** Resolve the stable BeePlan asset id from any persisted tldraw image record. */
export function getBeePlanAssetId(asset: { id: string; meta?: unknown; props?: unknown }, fallbackId?: string) {
  const metadata = asset.meta as { beeplanAssetId?: unknown; stableResolverUrl?: unknown } | null | undefined
  const metaId = metadata?.beeplanAssetId
  if (typeof metaId === 'string' && metaId.length > 0) return metaId

  if (typeof metadata?.stableResolverUrl === 'string') {
    const resolved = getBeePlanAssetIdFromResolver(metadata.stableResolverUrl)
    if (resolved) return resolved
  }

  const props = asset.props as { src?: unknown } | null | undefined
  if (typeof props?.src === 'string' && props.src.length > 0) {
    try {
      const resolved = getBeePlanAssetIdFromResolver(props.src)
      if (resolved) return resolved
    } catch {
      // Fall through to the legacy tldraw asset-id convention.
    }
  }

  return asset.id.match(/^asset:beeplan-(.+)$/)?.[1] ?? fallbackId ?? null
}

function getBeePlanAssetIdFromResolver(source: string) {
  try {
    const url = new URL(source, API_BASE_URL)
    const match = url.pathname.match(/\/whiteboard\/assets\/([^/]+)\/file\/?$/)
    return match?.[1] ? decodeURIComponent(match[1]) : null
  } catch {
    return null
  }
}

export function normalizeAssetSnapshot(value: unknown): unknown {
  return normalizeSnapshotValue(value, collectImageShapeAssetIds(value))
}

function normalizeSnapshotValue(value: unknown, shapeAssetIds: Map<string, string>): unknown {
  if (Array.isArray(value)) return value.map((item) => normalizeSnapshotValue(item, shapeAssetIds))
  if (typeof Blob !== 'undefined' && value instanceof Blob) return undefined
  if (value instanceof ArrayBuffer) return undefined
  if (typeof value === 'string' && (value.startsWith('blob:') || value.startsWith('data:image/'))) return undefined
  if (!value || typeof value !== 'object') return value
  const record = value as Record<string, unknown>
  const meta = record.meta as Record<string, unknown> | undefined
  if (record.typeName === 'asset' && record.type === 'image') {
    const originalProps = (record.props && typeof record.props === 'object' ? record.props : {}) as Record<string, unknown>
    const tldrawAssetId = typeof record.id === 'string' ? record.id : ''
    const referencedAssetId = shapeAssetIds.get(tldrawAssetId)
    const referencedBackendId = referencedAssetId?.match(/^asset:beeplan-(.+)$/)?.[1] ?? (referencedAssetId && !referencedAssetId.startsWith('asset:') ? referencedAssetId : undefined)
    const beeplanAssetId = getBeePlanAssetId({ id: tldrawAssetId, meta, props: originalProps }, referencedBackendId)
    const originalSrc = originalProps.src
    const hasUsableSrc = typeof originalSrc === 'string' && originalSrc.length > 0 && !originalSrc.startsWith('blob:') && !originalSrc.startsWith('data:image/') && !originalSrc.startsWith('asset:')
    const metadataResolver = typeof meta?.stableResolverUrl === 'string' && getBeePlanAssetIdFromResolver(meta.stableResolverUrl) === beeplanAssetId
      ? meta.stableResolverUrl
      : null
    const stableResolverUrl = beeplanAssetId
      ? (metadataResolver ?? whiteboardAssetResolverUrl(beeplanAssetId))
      : null
    const src = stableResolverUrl ?? (hasUsableSrc ? originalSrc : WHITEBOARD_IMAGE_UNAVAILABLE_URL)
    return {
      ...record,
      props: {
        ...originalProps,
        src,
        name: typeof originalProps.name === 'string' ? originalProps.name : 'Whiteboard image',
        mimeType: typeof originalProps.mimeType === 'string' ? originalProps.mimeType : 'image/*',
        w: typeof originalProps.w === 'number' && Number.isFinite(originalProps.w) ? originalProps.w : 800,
        h: typeof originalProps.h === 'number' && Number.isFinite(originalProps.h) ? originalProps.h : 600,
        isAnimated: typeof originalProps.isAnimated === 'boolean' ? originalProps.isAnimated : false,
      },
      meta: beeplanAssetId
        ? { ...meta, beeplanAssetId, tldrawAssetId, stableResolverUrl }
        : { ...meta, tldrawAssetId },
    }
  }
  const normalizedEntries = Object.entries(record)
    .map(([key, item]) => [key, normalizeSnapshotValue(item, shapeAssetIds)] as const)
    .filter(([, item]) => item !== undefined)
  return Object.fromEntries(normalizedEntries)
}

function collectImageShapeAssetIds(value: unknown): Map<string, string> {
  const result = new Map<string, string>()
  if (!value || typeof value !== 'object') return result
  const record = value as Record<string, unknown>
  const store = (record.document as Record<string, unknown> | undefined)?.store
  if (!store || typeof store !== 'object') return result
  for (const item of Object.values(store as Record<string, unknown>)) {
    if (!item || typeof item !== 'object') continue
    const candidate = item as Record<string, unknown>
    const props = candidate.props as Record<string, unknown> | undefined
    if (candidate.type === 'image' && typeof props?.assetId === 'string' && typeof candidate.id === 'string') {
      result.set(props.assetId, props.assetId)
    }
  }
  return result
}
