const apiUrl = (import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3000').replace(/\/+$/, '')

export type FocusSessionType = 'pomodoro' | 'deep' | 'long' | 'custom' | 'break'
export type FocusSessionStatus = 'active' | 'paused' | 'completed' | 'cancelled'
export type FocusTaskOutcome = 'done' | 'partial' | 'keep'

export type FocusSession = {
  id: string
  taskId: string | null
  taskTitle: string | null
  subtaskId?: string | null
  subtaskTitle?: string | null
  startedAt: string
  endedAt: string | null
  plannedMinutes: number
  actualMinutes: number | null
  status: FocusSessionStatus
  sessionType: FocusSessionType
  notes: string | null
  createdAt: string
}

export type FocusStats = {
  focusMinutesToday: number
  sessionsToday: number
  completedSessionsToday: number
  currentStreak: number
  totalFocusMinutesThisWeek: number
  topFocusTask: { taskId: string; title: string; minutes: number } | null
}

export type FocusRecommendation = {
  taskId: string
  taskTitle: string
  subtaskId?: string | null
  subtaskTitle?: string | null
  estimatedMinutes?: number | null
  reason: string
  recommendationReason?: string
  score: number
}

export type FocusQueueItem = {
  taskId: string
  taskTitle: string
  subtaskId: string | null
  subtaskTitle: string | null
  priority: string
  dueDate: string | null
  estimatedMinutes: number | null
  status: string
  hasOpenDependencies: boolean
}

export type StartFocusSessionPayload = {
  taskId?: string
  subtaskId?: string
  plannedMinutes: number
  sessionType?: FocusSessionType
}

export type FinishFocusSessionPayload = {
  actualMinutes?: number
  taskOutcome?: FocusTaskOutcome
  notes?: string
}

export type CancelFocusSessionPayload = {
  actualMinutes?: number
  notes?: string
}

async function request<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const url = `${apiUrl}${path}`
  let response: Response

  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    })
  } catch {
    throw new Error(`Unable to reach BeePlan API at ${apiUrl}.`)
  }

  if (response.status === 204) return undefined as T

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const message = Array.isArray(data?.message) ? data.message.join(', ') : data?.message
    throw new Error(message ?? 'Focus request failed. Please try again.')
  }
  return data as T
}

export function startFocusSession(accessToken: string, payload: StartFocusSessionPayload) {
  return request<FocusSession>(accessToken, '/focus/sessions/start', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
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
  )
}

export function cancelFocusSession(
  accessToken: string,
  sessionId: string,
  payload: CancelFocusSessionPayload = {},
) {
  return request<FocusSession>(accessToken, `/focus/sessions/${sessionId}/cancel`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export function getTodayFocusSessions(accessToken: string) {
  return request<FocusSession[]>(accessToken, '/focus/sessions/today')
}

export function getActiveFocusSession(accessToken: string) {
  return request<FocusSession | null>(accessToken, '/focus/active')
}

export function getFocusStats(accessToken: string) {
  return request<FocusStats>(accessToken, '/focus/stats')
}

export function getFocusRecommendation(accessToken: string) {
  return request<FocusRecommendation | null>(accessToken, '/focus/recommendation')
}

export function getFocusQueue(accessToken: string) {
  return request<FocusQueueItem[]>(accessToken, '/focus/queue')
}

export const SESSION_TYPE_PRESETS: {
  type: FocusSessionType
  label: string
  minutes: number
  description: string
}[] = [
  { type: 'pomodoro', label: 'Pomodoro', minutes: 25, description: 'Classic 25 minute sprint' },
  { type: 'deep', label: 'Deep Work', minutes: 50, description: 'Sustained 50 minute block' },
  { type: 'long', label: 'Long Focus', minutes: 90, description: 'Extended 90 minute session' },
  { type: 'custom', label: 'Custom', minutes: 30, description: 'Choose your own duration' },
]

export const BREAK_PRESETS: { label: string; minutes: number }[] = [
  { label: 'Short break', minutes: 5 },
  { label: 'Long break', minutes: 15 },
]

export function formatFocusMinutes(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes))
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours && rest) return `${hours}h ${rest}m`
  if (hours) return `${hours}h`
  return `${rest}m`
}
