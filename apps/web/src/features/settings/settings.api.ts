import type { AuthUser } from '../../lib/api'
import { getAuthHeaders } from '../../lib/api'

const apiUrl = (import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3000').replace(/\/+$/, '')

async function request<T>(path: string, accessToken: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders(accessToken), ...init.headers },
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.message ?? 'Unable to save settings.')
  return data as T
}

export function updateProfile(accessToken: string, profile: Pick<AuthUser, 'fullName' | 'email' | 'avatarUrl' | 'timezone'>) {
  return request<AuthUser>('/auth/profile', accessToken, { method: 'PATCH', body: JSON.stringify(profile) })
}

export function changePassword(accessToken: string, currentPassword: string, newPassword: string) {
  return request<{ ok: true }>('/auth/password', accessToken, {
    method: 'PATCH',
    body: JSON.stringify({ currentPassword, newPassword }),
  })
}

export function deleteAccount(accessToken: string) {
  return request<{ ok: true }>('/auth/account', accessToken, { method: 'DELETE' })
}
