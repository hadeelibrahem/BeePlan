import { buildWhiteboardWebViewUrl, resolveWebAppConfig } from './mobileConfig'

test('missing WebView URL is reported as missing configuration', () => {
  expect(resolveWebAppConfig('')).toEqual({ kind: 'missing_config', message: 'EXPO_PUBLIC_WEB_APP_URL is not configured.' })
})

test('localhost and invalid URLs are rejected for device loading', () => {
  expect(resolveWebAppConfig(' http://localhost:5173 ')).toMatchObject({ kind: 'invalid_url' })
  expect(resolveWebAppConfig('beeplan.local')).toMatchObject({ kind: 'invalid_url' })
})

test('LAN URL builds the mobile board route without a token', () => {
  const config = resolveWebAppConfig('http://192.168.1.16:5173/')
  expect(config).toMatchObject({ kind: 'valid', url: 'http://192.168.1.16:5173' })
  expect(config.kind === 'valid' ? buildWhiteboardWebViewUrl(config.url, 'board/1') : null).toBe('http://192.168.1.16:5173/whiteboards/board%2F1?mobile=1')
  expect(buildWhiteboardWebViewUrl('https://beeplan.example', '')).toBeNull()
})
