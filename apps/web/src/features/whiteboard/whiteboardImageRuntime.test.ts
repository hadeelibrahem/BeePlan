import { describe, expect, it } from 'vitest'
import { assertValidRuntimeImageUrl, createRuntimeImageUrl } from './whiteboardImageRuntime'

describe('whiteboard runtime image URLs', () => {
  it('creates a tldraw-compatible image data URL without prefix concatenation', async () => {
    const url = await createRuntimeImageUrl(new Blob(['image'], { type: 'image/png' }))
    expect(assertValidRuntimeImageUrl(url)).toBe(url)
    expect(url.startsWith('data:image/png;base64,')).toBe(true)
  })

  it('rejects a manually double-prefixed Blob URL', () => {
    expect(() => assertValidRuntimeImageUrl('blob:http://localhost:5173/image')).toThrow('Invalid runtime image URL')
  })
})
