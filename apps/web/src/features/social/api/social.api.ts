import type {
  CreatePersonReminderInput,
  FriendRequest,
  FriendSummary,
  LocationSharingPermission,
  ParsePersonReminderResult,
  SharingExpiration,
} from '../types/social.types'

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

async function apiRequest(path: string, accessToken: string, init?: RequestInit) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...init?.headers,
    },
  })
  const data = await response.json().catch(() => null)

  if (!response.ok) {
    const message = Array.isArray(data?.message) ? data.message.join(', ') : data?.message
    throw new Error(message ?? 'Something went wrong. Please try again.')
  }

  return data
}

// --- Friends ---------------------------------------------------------------

export function getFriends(accessToken: string): Promise<FriendSummary[]> {
  return apiRequest('/friends', accessToken) as Promise<FriendSummary[]>
}

export function getFriendRequests(accessToken: string): Promise<FriendRequest[]> {
  return apiRequest('/friends/requests', accessToken) as Promise<FriendRequest[]>
}

export function sendFriendRequest(email: string, accessToken: string) {
  return apiRequest('/friends/requests', accessToken, {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export function acceptFriendRequest(id: string, accessToken: string) {
  return apiRequest(`/friends/requests/${id}/accept`, accessToken, { method: 'POST' })
}

export function rejectFriendRequest(id: string, accessToken: string) {
  return apiRequest(`/friends/requests/${id}/reject`, accessToken, { method: 'POST' })
}

// Cancels an outgoing request the current user sent (requester-only).
export function cancelFriendRequest(id: string, accessToken: string) {
  return apiRequest(`/friends/requests/${id}`, accessToken, { method: 'DELETE' })
}

// Removes an accepted friend (either direction).
export function removeFriend(userId: string, accessToken: string) {
  return apiRequest(`/friends/${userId}`, accessToken, { method: 'DELETE' })
}

// --- Location sharing ------------------------------------------------------

export function getLocationSharing(accessToken: string): Promise<LocationSharingPermission[]> {
  return apiRequest('/location-sharing', accessToken) as Promise<LocationSharingPermission[]>
}

export function requestLocationSharing(
  friendId: string,
  expiration: SharingExpiration,
  accessToken: string,
) {
  return apiRequest('/location-sharing/requests', accessToken, {
    method: 'POST',
    body: JSON.stringify({ friendId, expiration }),
  })
}

export function acceptLocationSharing(id: string, accessToken: string) {
  return apiRequest(`/location-sharing/requests/${id}/accept`, accessToken, { method: 'POST' })
}

export function rejectLocationSharing(id: string, accessToken: string) {
  return apiRequest(`/location-sharing/requests/${id}/reject`, accessToken, { method: 'POST' })
}

export function revokeLocationSharing(id: string, accessToken: string) {
  return apiRequest(`/location-sharing/permissions/${id}/revoke`, accessToken, { method: 'POST' })
}

// --- Person reminders ------------------------------------------------------

export function parsePersonReminder(
  text: string,
  accessToken: string,
): Promise<ParsePersonReminderResult> {
  return apiRequest('/ai/parse-person-reminder', accessToken, {
    method: 'POST',
    body: JSON.stringify({ text }),
  }) as Promise<ParsePersonReminderResult>
}

export function createPersonReminder(input: CreatePersonReminderInput, accessToken: string) {
  return apiRequest('/person-reminders', accessToken, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}
