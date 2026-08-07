import { describe, expect, it } from 'vitest'
import { normalizeWhiteboardUrl, whiteboardUrlLabel } from './whiteboardLinkUtils'

describe('whiteboard link utilities', () => {
  it('accepts HTTP and HTTPS URLs and rejects unsafe protocols', () => {
    expect(normalizeWhiteboardUrl('https://example.com/path')).toBe('https://example.com/path')
    expect(normalizeWhiteboardUrl('http://example.com')).toBe('http://example.com/')
    expect(normalizeWhiteboardUrl('javascript:alert(1)')).toBeNull()
    expect(normalizeWhiteboardUrl('data:text/html,unsafe')).toBeNull()
    expect(normalizeWhiteboardUrl('file:///tmp/test')).toBeNull()
  })

  it('uses a safe domain label without fetching metadata', () => {
    expect(whiteboardUrlLabel('https://www.example.com/a')).toBe('example.com')
  })
})
