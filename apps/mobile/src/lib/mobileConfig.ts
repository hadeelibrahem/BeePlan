import { API_BASE_URL } from './apiClient'

export type WebAppConfig =
  | { kind: 'valid'; url: string; origin: string }
  | { kind: 'missing_config'; message: string }
  | { kind: 'invalid_url'; message: string }

const RAW_WEB_APP_URL = process.env.EXPO_PUBLIC_WEB_APP_URL

export function resolveWebAppConfig(rawValue: string | undefined = RAW_WEB_APP_URL): WebAppConfig {
  const value = rawValue?.trim() ?? ''
  if (!value) return { kind: 'missing_config', message: 'EXPO_PUBLIC_WEB_APP_URL is not configured.' }

  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('unsupported protocol')
    if (parsed.username || parsed.password || /localhost|127\.0\.0\.1/i.test(parsed.hostname)) {
      throw new Error('local or credentialed URL is not reachable safely from a device')
    }
    const normalized = parsed.toString().replace(/\/$/, '')
    return { kind: 'valid', url: normalized, origin: parsed.origin }
  } catch {
    return { kind: 'invalid_url', message: 'EXPO_PUBLIC_WEB_APP_URL must be an absolute http:// or https:// LAN or public URL.' }
  }
}

export function buildWhiteboardWebViewUrl(webAppUrl: string, boardId: string): string | null {
  const normalizedBoardId = boardId.trim()
  if (!normalizedBoardId) return null
  const base = webAppUrl.replace(/\/+$/, '')
  return `${base}/whiteboards/${encodeURIComponent(normalizedBoardId)}?mobile=1`
}

export function logWebAppConfig(config: WebAppConfig) {
  if (!__DEV__) return
  console.log('[MOBILE_WHITEBOARD] WEB_APP_CONFIG', {
    kind: config.kind,
    url: config.kind === 'valid' ? config.url : undefined,
    apiOrigin: API_BASE_URL ? new URL(API_BASE_URL).origin : undefined,
  })
}
