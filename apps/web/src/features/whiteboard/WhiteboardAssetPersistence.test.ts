import { describe, expect, it } from 'vitest'
import { getBeePlanAssetId, normalizeAssetSnapshot, WHITEBOARD_IMAGE_UNAVAILABLE_URL } from './whiteboardSnapshotUtils'

describe('whiteboard asset persistence', () => {
  it('replaces runtime blob URLs with stable backend asset references', () => {
    const snapshot = { document: { store: { 'asset:1': { typeName: 'asset', type: 'image', meta: { beeplanAssetId: 'asset-1' }, props: { src: 'blob:http://temporary' } } } } }
    const persisted = normalizeAssetSnapshot(snapshot) as { document: { store: { 'asset:1': { props: { src: string } } } } }
    expect(persisted.document.store['asset:1'].props.src).toContain('/whiteboard/assets/asset-1/file')
    expect(JSON.stringify(persisted)).not.toContain('blob:')
  })

  it('never forwards temporary or binary image values', () => {
    const snapshot = { document: { store: { orphan: { typeName: 'asset', props: { src: 'blob:http://temporary' } }, encoded: 'data:image/png;base64,AAAA', binary: new ArrayBuffer(8) } } }
    const persisted = JSON.stringify(normalizeAssetSnapshot(snapshot))
    expect(persisted).not.toContain('blob:')
    expect(persisted).not.toContain('data:image/')
    expect(persisted).not.toContain('binary')
  })

  it('repairs an image with missing src before tldraw restoration', () => {
    const repaired = normalizeAssetSnapshot({
      typeName: 'asset', type: 'image', id: 'asset:beeplan-asset-1',
      props: { w: 1200, h: 800, name: 'diagram.png', mimeType: 'image/png', src: undefined },
    }) as { props: { src: string; w: number; h: number; name: string; mimeType: string; isAnimated: boolean }; meta: { beeplanAssetId: string } }
    expect(repaired.props.src).toContain('/whiteboard/assets/asset-1/file')
    expect(repaired.props.w).toBe(1200)
    expect(repaired.props.h).toBe(800)
    expect(repaired.props.isAnimated).toBe(false)
    expect(repaired.meta.beeplanAssetId).toBe('asset-1')
  })

  it('resolves the backend id from a persisted resolver URL', () => {
    expect(getBeePlanAssetId({
      id: 'asset:unrelated',
      props: { src: 'http://127.0.0.1:3000/whiteboard/assets/uuid-1/file?download=1' },
    })).toBe('uuid-1')
    expect(getBeePlanAssetId({
      id: 'asset:unrelated',
      props: { src: '/whiteboard/assets/uuid-2/file/' },
    })).toBe('uuid-2')
  })

  it('repairs the invalid missing source to a real unavailable-image URL', () => {
    const repaired = normalizeAssetSnapshot({
      document: { store: {
        'asset:image-1': { id: 'asset:image-1', typeName: 'asset', type: 'image', props: { src: 'asset:beeplan-missing' } },
        'shape:image-1': { id: 'shape:image-1', type: 'image', props: { assetId: 'asset:image-1' } },
      } },
    }) as { document: { store: { 'asset:image-1': { props: { src: string } } } } }
    expect(repaired.document.store['asset:image-1'].props.src).toBe(WHITEBOARD_IMAGE_UNAVAILABLE_URL)
    expect(JSON.stringify(repaired)).not.toContain('asset:beeplan-missing')
  })

  it('restores the stable resolver when runtime source is unavailable', () => {
    const resolver = 'http://127.0.0.1:3000/whiteboard/assets/uuid-3/file'
    const repaired = normalizeAssetSnapshot({
      typeName: 'asset', type: 'image', id: 'asset:other',
      meta: { tldrawAssetId: 'asset:other', beeplanAssetId: 'uuid-3', stableResolverUrl: resolver },
      props: { src: '/whiteboard-image-unavailable.svg' },
    }) as { props: { src: string }; meta: { beeplanAssetId: string; stableResolverUrl: string } }
    expect(repaired.props.src).toBe(resolver)
    expect(repaired.meta.beeplanAssetId).toBe('uuid-3')
    expect(repaired.meta.stableResolverUrl).toBe(resolver)
  })
})
