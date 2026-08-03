const apiUrl = (import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3000').replace(/\/+$/, '')
export type GoogleCalendar = { id: string; externalId: string; summary: string; description?: string | null; timezone?: string | null; color?: string | null; selected: boolean }
export type GoogleCalendarStatus = { connected: boolean; email?: string; lastSyncedAt?: string | null; syncDirection?: string; syncTasks?: boolean; syncFocusSessions?: boolean; syncReminders?: boolean; syncCalendarBlocks?: boolean }
export type GoogleSyncJob = { id: string; entityId: string; operation: string; status: string; attemptCount: number; lastError?: string | null }
async function request<T>(token: string, path: string, init?: RequestInit): Promise<T> { const response = await fetch(`${apiUrl}${path}`, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) } }); const data = await response.json().catch(() => null); if (!response.ok) throw new Error(data?.message ?? 'Google Calendar request failed.'); return data as T }
export const getGoogleCalendarStatus = (token: string) => request<GoogleCalendarStatus>(token, '/google-calendar/status')
export const getGoogleCalendars = (token: string) => request<GoogleCalendar[]>(token, '/google-calendar/calendars')
export const getGoogleConnectUrl = (token: string) => request<{ url: string }>(token, '/google-calendar/connect')
export const selectGoogleCalendars = (token: string, calendarIds: string[]) => request(token, '/google-calendar/calendars', { method: 'PUT', body: JSON.stringify({ calendarIds }) })
export const syncGoogleCalendar = (token: string) => request<{ lastSyncedAt: string; imported: number }>(token, '/google-calendar/sync', { method: 'POST' })
export const updateGoogleCalendarSettings = (token: string, body: { syncDirection: string; defaultReminderMinutes: number; syncTasks?: boolean; syncFocusSessions?: boolean; syncReminders?: boolean; syncCalendarBlocks?: boolean }) => request(token, '/google-calendar/settings', { method: 'PUT', body: JSON.stringify(body) })
export const disconnectGoogleCalendar = (token: string) => request(token, '/google-calendar/disconnect', { method: 'DELETE' })
export const getGoogleSyncJobs = (token: string) => request<GoogleSyncJob[]>(token, '/google-calendar/sync-jobs')
export const retryGoogleSyncJob = (token: string, jobId: string) => request(token, `/google-calendar/sync-jobs/${jobId}/retry`, { method: 'POST' })
