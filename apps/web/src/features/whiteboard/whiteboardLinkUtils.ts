export function normalizeWhiteboardUrl(value: string) {
  const trimmed = value.trim()
  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.href
  } catch {
    return null
  }
}

export function whiteboardUrlLabel(value: string) {
  try { return new URL(value).hostname.replace(/^www\./, '') } catch { return value }
}
