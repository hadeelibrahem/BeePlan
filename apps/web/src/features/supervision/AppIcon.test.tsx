import { describe, expect, it } from 'vitest'
import { isRenderableAppIcon } from './AppIcon'

describe('approved app icon sources', () => {
  it('accepts native PNG data URIs', () => expect(isRenderableAppIcon('data:image/png;base64,AAAA')).toBe(true))
  it('rejects unsafe or malformed data', () => expect(isRenderableAppIcon('data:text/html;base64,AAAA')).toBe(false))
  it('accepts server image URLs and falls back for missing values', () => { expect(isRenderableAppIcon('https://cdn.example/icon.png')).toBe(true); expect(isRenderableAppIcon(null)).toBe(false) })
  it('allows only image data URI MIME types', () => {
    expect(isRenderableAppIcon('data:image/webp;base64,AAAA')).toBe(true)
    expect(isRenderableAppIcon('data:image/jpeg;base64,AAAA')).toBe(true)
    expect(isRenderableAppIcon('data:text/html;base64,AAAA')).toBe(false)
    expect(isRenderableAppIcon('javascript:alert(1)')).toBe(false)
  })
})
