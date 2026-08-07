import type { AuthUser } from './api'

declare global {
  interface Window { ReactNativeWebView?: { postMessage: (message: string) => void } }
}

export const MOBILE_AUTH_READY = 'BEEPLAN_WEBVIEW_READY'
export const MOBILE_AUTH_SESSION = 'BEEPLAN_AUTH_SESSION'
export const MOBILE_AUTH_CLEAR = 'BEEPLAN_AUTH_CLEAR'

export type MobileAuthMessage =
  | { type: typeof MOBILE_AUTH_SESSION; payload: { accessToken: string; expiresAt?: string | number; user: AuthUser } }
  | { type: typeof MOBILE_AUTH_CLEAR }

export function isMobileWebView(search: string) { return new URLSearchParams(search).get('mobile') === '1' }

function isUser(value: unknown): value is AuthUser {
  if (!value || typeof value !== 'object') return false
  const user = value as Partial<AuthUser>
  return typeof user.id === 'string' && typeof user.fullName === 'string' && typeof user.username === 'string' && typeof user.email === 'string' && (typeof user.avatarUrl === 'string' || user.avatarUrl === null) && typeof user.timezone === 'string'
}

export function parseMobileAuthMessage(raw: unknown): MobileAuthMessage | null {
  let value: unknown = raw
  if (typeof raw === 'string') { try { value = JSON.parse(raw) } catch { return null } }
  if (!value || typeof value !== 'object') return null
  const message = value as { type?: unknown; payload?: unknown }
  if (message.type === MOBILE_AUTH_CLEAR) return { type: MOBILE_AUTH_CLEAR }
  if (message.type !== MOBILE_AUTH_SESSION || !message.payload || typeof message.payload !== 'object') return null
  const payload = message.payload as { accessToken?: unknown; expiresAt?: unknown; user?: unknown }
  if (typeof payload.accessToken !== 'string' || !payload.accessToken.trim() || !isUser(payload.user)) return null
  if (payload.expiresAt !== undefined && typeof payload.expiresAt !== 'string' && typeof payload.expiresAt !== 'number') return null
  return { type: MOBILE_AUTH_SESSION, payload: { accessToken: payload.accessToken, expiresAt: payload.expiresAt as string | number | undefined, user: payload.user } }
}
