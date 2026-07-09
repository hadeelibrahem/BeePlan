import { API_BASE_URL, apiFetch, readJsonOrThrow } from './apiClient';

export type FocusSessionType = 'pomodoro' | 'deep' | 'long' | 'custom' | 'break';
export type FocusSessionStatus = 'active' | 'paused' | 'completed' | 'cancelled';
export type FocusTaskOutcome = 'done' | 'partial' | 'keep';

export type FocusSession = {
  id: string;
  taskId: string | null;
  taskTitle: string | null;
  startedAt: string;
  endedAt: string | null;
  plannedMinutes: number;
  actualMinutes: number | null;
  status: FocusSessionStatus;
  sessionType: FocusSessionType;
  notes: string | null;
  createdAt: string;
};

export type FocusStats = {
  focusMinutesToday: number;
  sessionsToday: number;
  completedSessionsToday: number;
  currentStreak: number;
  totalFocusMinutesThisWeek: number;
  topFocusTask: { taskId: string; title: string; minutes: number } | null;
};

export type FocusRecommendation = {
  taskId: string;
  taskTitle: string;
  reason: string;
  score: number;
};

export type StartFocusSessionPayload = {
  taskId?: string;
  plannedMinutes: number;
  sessionType?: FocusSessionType;
};

export type FinishFocusSessionPayload = {
  actualMinutes?: number;
  taskOutcome?: FocusTaskOutcome;
  notes?: string;
};

export type CancelFocusSessionPayload = {
  actualMinutes?: number;
  notes?: string;
};

async function request<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (response.status === 204) return undefined as T;
  return readJsonOrThrow<T>(response, `${API_BASE_URL}${path}`);
}

export function startFocusSession(accessToken: string, payload: StartFocusSessionPayload) {
  return request<FocusSession>(accessToken, '/focus/sessions/start', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function finishFocusSession(
  accessToken: string,
  sessionId: string,
  payload: FinishFocusSessionPayload,
) {
  return request<{ session: FocusSession; taskUpdated: boolean }>(
    accessToken,
    `/focus/sessions/${sessionId}/finish`,
    { method: 'PATCH', body: JSON.stringify(payload) },
  );
}

export function cancelFocusSession(
  accessToken: string,
  sessionId: string,
  payload: CancelFocusSessionPayload = {},
) {
  return request<FocusSession>(accessToken, `/focus/sessions/${sessionId}/cancel`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function getTodayFocusSessions(accessToken: string) {
  return request<FocusSession[]>(accessToken, '/focus/sessions/today');
}

export function getFocusStats(accessToken: string) {
  return request<FocusStats>(accessToken, '/focus/stats');
}

export function getFocusRecommendation(accessToken: string) {
  return request<FocusRecommendation | null>(accessToken, '/focus/recommendation');
}

export const SESSION_TYPE_PRESETS: {
  type: FocusSessionType;
  label: string;
  minutes: number;
  description: string;
}[] = [
  { type: 'pomodoro', label: 'Pomodoro', minutes: 25, description: 'Classic 25 minute sprint' },
  { type: 'deep', label: 'Deep Work', minutes: 50, description: 'Sustained 50 minute block' },
  { type: 'long', label: 'Long Focus', minutes: 90, description: 'Extended 90 minute session' },
  { type: 'custom', label: 'Custom', minutes: 30, description: 'Choose your own duration' },
];

export const BREAK_PRESETS: { label: string; minutes: number }[] = [
  { label: 'Short break', minutes: 5 },
  { label: 'Long break', minutes: 15 },
];

export function formatFocusMinutes(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours && rest) return `${hours}h ${rest}m`;
  if (hours) return `${hours}h`;
  return `${rest}m`;
}

export function labelForFocusType(type: FocusSessionType): string {
  return SESSION_TYPE_PRESETS.find((item) => item.type === type)?.label ?? 'Focus';
}

export function formatFocusClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
