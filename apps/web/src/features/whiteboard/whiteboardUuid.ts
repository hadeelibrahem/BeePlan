export type WhiteboardUuidStrategy = 'randomUUID' | 'getRandomValues'

export function createWhiteboardUuid(): string {
  const cryptoApi = globalThis.crypto
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    if (import.meta.env.DEV) console.debug('[WhiteboardCompatibility] UUID strategy', 'randomUUID')
    return cryptoApi.randomUUID()
  }
  if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
    if (import.meta.env.DEV) console.debug('[WhiteboardCompatibility] UUID strategy', 'getRandomValues')
    const bytes = new Uint8Array(16)
    cryptoApi.getRandomValues(bytes)
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'))
    return [hex.slice(0, 4).join(''), hex.slice(4, 6).join(''), hex.slice(6, 8).join(''), hex.slice(8, 10).join(''), hex.slice(10, 16).join('')].join('-')
  }
  throw new Error('Secure UUID generation is unavailable in this WebView.')
}
