import { apiFetch, readJsonOrThrow } from './apiClient';
import { API_BASE_URL } from './apiClient';

export type GoogleCalendar = { id: string; externalId: string; summary: string; timezone?: string | null; color?: string | null; selected: boolean };
export type GoogleCalendarStatus = { connected: boolean; email?: string; lastSyncedAt?: string | null; syncDirection?: string; syncTasks?: boolean; syncFocusSessions?: boolean; syncReminders?: boolean; syncCalendarBlocks?: boolean };
export type GoogleSyncJob = { id: string; entityId: string; operation: string; status: string; attemptCount: number; lastError?: string | null };

async function request<T>(token: string, path: string, init?: RequestInit) {
  const response = await apiFetch(path, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) } });
  return readJsonOrThrow<T>(response, `${API_BASE_URL}${path}`);
}

export const getGoogleCalendarStatus = (token: string) => request<GoogleCalendarStatus>(token, '/google-calendar/status');
export const getGoogleCalendars = (token: string) => request<GoogleCalendar[]>(token, '/google-calendar/calendars');
export const getGoogleConnectUrl = (token: string, returnTo = 'beeplan://settings?googleCalendar=connected') => request<{ url: string }>(token, `/google-calendar/connect?returnTo=${encodeURIComponent(returnTo)}`);
export const selectGoogleCalendars = (token: string, calendarIds: string[]) => request(token, '/google-calendar/calendars', { method: 'PUT', body: JSON.stringify({ calendarIds }) });
export const syncGoogleCalendar = (token: string) => request<{ lastSyncedAt: string; imported: number }>(token, '/google-calendar/sync', { method: 'POST' });
export const updateGoogleCalendarSettings = (token: string, body: { syncDirection: string; defaultReminderMinutes: number; syncTasks?: boolean; syncFocusSessions?: boolean; syncReminders?: boolean; syncCalendarBlocks?: boolean }) => request(token, '/google-calendar/settings', { method: 'PUT', body: JSON.stringify(body) });
export const disconnectGoogleCalendar = (token: string) => request(token, '/google-calendar/disconnect', { method: 'DELETE' });
export const getGoogleSyncJobs = (token: string) => request<GoogleSyncJob[]>(token, '/google-calendar/sync-jobs');
export const retryGoogleSyncJob = (token: string, jobId: string) => request(token, `/google-calendar/sync-jobs/${encodeURIComponent(jobId)}/retry`, { method: 'POST' });
export const getGoogleEvents = (token: string, date: string) => {
  const from = new Date(`${date}T00:00:00`).toISOString();
  const to = new Date(`${date}T23:59:59`).toISOString();
  return request<Array<{ id: string; title: string; location?: string | null; startAt?: string | null; endAt?: string | null; allDay: boolean; status: string }>>(token, `/google-calendar/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
};
