import { createWhiteboardUuid } from './whiteboardUuid'

const originalCrypto = globalThis.crypto

afterEach(() => { Object.defineProperty(globalThis, 'crypto', { configurable: true, value: originalCrypto }) })

test('uses crypto.randomUUID when available', () => {
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { randomUUID: () => '00000000-0000-4000-8000-000000000001' } })
  expect(createWhiteboardUuid()).toBe('00000000-0000-4000-8000-000000000001')
})

test('falls back to secure getRandomValues and creates UUID v4 values', () => {
  let seed = 0
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { getRandomValues: (bytes: Uint8Array) => { bytes.fill(seed++); return bytes } } })
  const first = createWhiteboardUuid(); const second = createWhiteboardUuid()
  expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  expect(second).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  expect(first).not.toBe(second)
})

test('throws a clear compatibility error without secure crypto', () => {
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined })
  expect(() => createWhiteboardUuid()).toThrow('Secure UUID generation is unavailable')
})
