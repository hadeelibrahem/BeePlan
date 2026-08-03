import { apiFetch, readJsonOrThrow } from './apiClient';

export type MobileNotificationPreferences = {
  taskNotifications: boolean;
  calendarNotifications: boolean;
  focusNotifications: boolean;
  collaborationNotifications: boolean;
  aiNotifications: boolean;
  emailNotifications: boolean;
  pushNotifications: boolean;
};

export function getNotificationPreferences(accessToken: string) {
  return apiFetch('/notifications/preferences', { headers: { Authorization: `Bearer ${accessToken}` } }).then((response) => readJsonOrThrow<MobileNotificationPreferences>(response, 'notification preferences'));
}

export function updateNotificationPreferences(accessToken: string, patch: Partial<MobileNotificationPreferences>) {
  return apiFetch('/notifications/preferences', { method: 'PATCH', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(patch) }).then((response) => readJsonOrThrow<MobileNotificationPreferences>(response, 'notification preferences update'));
}
