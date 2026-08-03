import type { AuthUser } from '../../lib/api';
import { apiFetch, readJsonOrThrow } from '../../lib/apiClient';

export function validateProfileDraft(profile: { fullName: string; username: string; email: string }) {
  if (!profile.fullName.trim()) return 'Full name is required.';
  if (!/^\S+@\S+\.\S+$/.test(profile.email.trim())) return 'Enter a valid email.';
  if (!/^[a-z0-9](?:[a-z0-9_]{1,18}[a-z0-9])?$/.test(profile.username.trim().toLowerCase())) return 'Username must be 3–20 letters, numbers, or underscores.';
  return null;
}

async function request<T>(token: string, path: string, init: RequestInit) {
  const response = await apiFetch(path, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });
  return readJsonOrThrow<T>(response, path);
}

export function updateProfile(token: string, profile: Pick<AuthUser, 'fullName' | 'username' | 'email' | 'avatarUrl' | 'timezone'>) {
  return request<AuthUser>(token, '/auth/profile', { method: 'PATCH', body: JSON.stringify(profile) });
}

export function changePassword(token: string, currentPassword: string, newPassword: string) {
  return request<{ ok: true }>(token, '/auth/password', { method: 'PATCH', body: JSON.stringify({ currentPassword, newPassword }) });
}
