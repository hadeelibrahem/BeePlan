import { describe, expect, it, vi } from 'vitest'
import { downloadWhiteboardAsset } from './whiteboardApi'

describe('whiteboard asset delivery', () => {
  it('fetches image bytes with Bearer authentication and validates content type', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'image/png' },
      blob: async () => new Blob(['png-bytes'], { type: 'image/png' }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const blob = await downloadWhiteboardAsset('token-1', { url: '/whiteboard/assets/asset-1/file', mimeType: 'image/png' })
    expect(blob.size).toBeGreaterThan(0)
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:3000/whiteboard/assets/asset-1/file', expect.objectContaining({ headers: { Authorization: 'Bearer token-1' } }))
    vi.unstubAllGlobals()
  })

  it('rejects JSON responses masquerading as image content', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, headers: { get: () => 'application/json' }, blob: async () => new Blob(['{}'], { type: 'application/json' }) }))
    await expect(downloadWhiteboardAsset('token-1', { url: '/whiteboard/assets/asset-1/file', mimeType: 'image/png' })).rejects.toThrow('valid image data')
    vi.unstubAllGlobals()
  })
})
