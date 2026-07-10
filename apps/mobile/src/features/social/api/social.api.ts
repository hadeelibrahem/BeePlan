import { API_BASE_URL, apiFetch, readJsonOrThrow } from '../../../lib/apiClient';
import { getAuthToken } from '../../../lib/authToken';
import type { LocationSnapshot } from '../../../lib/location';
import type {
  CreatePersonReminderInput,
  FriendRequest,
  FriendSummary,
  LocationSharingPermission,
  NearbyHit,
  ParsePersonReminderResult,
} from '../types/social.types';

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const response = await apiFetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  return readJsonOrThrow<T>(response, `${API_BASE_URL}${path}`);
}

// --- Friends ---------------------------------------------------------------

export function getFriends(): Promise<FriendSummary[]> {
  return apiRequest<FriendSummary[]>('/friends');
}

export function getFriendRequests(): Promise<FriendRequest[]> {
  return apiRequest<FriendRequest[]>('/friends/requests');
}

export function sendFriendRequest(email: string) {
  return apiRequest('/friends/requests', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export function acceptFriendRequest(id: string) {
  return apiRequest(`/friends/requests/${id}/accept`, { method: 'POST' });
}

export function rejectFriendRequest(id: string) {
  return apiRequest(`/friends/requests/${id}/reject`, { method: 'POST' });
}

// Cancels an outgoing request the current user sent (requester-only).
export function cancelFriendRequest(id: string) {
  return apiRequest(`/friends/requests/${id}`, { method: 'DELETE' });
}

// Removes an accepted friend (either direction).
export function removeFriend(userId: string) {
  return apiRequest(`/friends/${userId}`, { method: 'DELETE' });
}

// --- Location sharing ------------------------------------------------------

export function getLocationSharing(): Promise<LocationSharingPermission[]> {
  return apiRequest<LocationSharingPermission[]>('/location-sharing');
}

export function acceptLocationSharing(id: string) {
  return apiRequest(`/location-sharing/requests/${id}/accept`, { method: 'POST' });
}

export function rejectLocationSharing(id: string) {
  return apiRequest(`/location-sharing/requests/${id}/reject`, { method: 'POST' });
}

export function revokeLocationSharing(id: string) {
  return apiRequest(`/location-sharing/permissions/${id}/revoke`, { method: 'POST' });
}

// --- Person reminders ------------------------------------------------------

export function parsePersonReminder(text: string): Promise<ParsePersonReminderResult> {
  return apiRequest<ParsePersonReminderResult>('/ai/parse-person-reminder', {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
}

export function createPersonReminder(input: CreatePersonReminderInput) {
  return apiRequest('/person-reminders', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** Upserts the caller's latest location snapshot. Sent to BeePlan only. */
export function updateLocationSnapshot(snapshot: LocationSnapshot) {
  return apiRequest('/person-reminders/location-snapshot', {
    method: 'POST',
    body: JSON.stringify({
      latitude: snapshot.latitude,
      longitude: snapshot.longitude,
      accuracy: snapshot.accuracy,
    }),
  });
}

export function checkNearby(): Promise<NearbyHit[]> {
  return apiRequest<NearbyHit[]>('/person-reminders/nearby');
}
