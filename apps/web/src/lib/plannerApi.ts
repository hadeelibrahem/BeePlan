const apiUrl = (import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3000').replace(/\/+$/, '')

export type DailyPlanItem = {
  id: string
  type: 'task' | 'reminder' | 'break' | 'calendar'
  taskId?: string
  reminderId?: string
  title: string
  startTime: string
  endTime: string
  durationMinutes: number
  priority: 'low' | 'medium' | 'high' | 'urgent'
  category?: string
  isFocusTask?: boolean
  locked?: boolean
  rationale?: string
}

export type DailyPlan = {
  date: string
  generatedAt: string
  source: 'ai' | 'fallback'
  workingHours: { start: string; end: string }
  summary: string
  sections: Record<'morning' | 'afternoon' | 'evening' | 'night', DailyPlanItem[]>
  unscheduled: { taskId?: string; reminderId?: string; title: string; reason: string }[]
}

export type GenerateDailyPlanPayload = {
  date?: string
  currentTime?: string
  workingHours?: { start?: string; end?: string }
  lockedItems?: { taskId?: string; reminderId?: string; startTime: string; endTime: string }[]
}

export async function generateDailyPlan(accessToken: string, payload: GenerateDailyPlanPayload = {}) {
  const response = await fetch(`${apiUrl}/ai/planner/daily`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  })
  const data = await response.json().catch(() => null)

  if (!response.ok) {
    const message = Array.isArray(data?.message) ? data.message.join(', ') : data?.message
    throw new Error(message ?? 'Unable to generate today\'s plan.')
  }

  return data as DailyPlan
}

export type EnergyLevel = 'high' | 'medium' | 'low'

export type PlannerPreferences = {
  focusStartTime: string
  focusEndTime: string
  workBlockMinutes: number
  breakMinutes: number
  energy: { morning: EnergyLevel; afternoon: EnergyLevel; evening: EnergyLevel; night: EnergyLevel }
  scheduleHardTasksInFocus: boolean
  finishStartedFirst: boolean
  groupSimilarTasks: boolean
  bufferBeforeMeetings: boolean
  bufferMinutes: number
  note: string
}

export async function getPlannerPreferences(accessToken: string) {
  const response = await fetch(`${apiUrl}/ai/planner/preferences`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const data = await response.json().catch(() => null)

  if (!response.ok) {
    const message = Array.isArray(data?.message) ? data.message.join(', ') : data?.message
    throw new Error(message ?? 'Unable to load planning preferences.')
  }

  return data as PlannerPreferences
}

export async function updatePlannerPreferences(accessToken: string, preferences: PlannerPreferences) {
  const response = await fetch(`${apiUrl}/ai/planner/preferences`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(preferences),
  })
  const data = await response.json().catch(() => null)

  if (!response.ok) {
    const message = Array.isArray(data?.message) ? data.message.join(', ') : data?.message
    throw new Error(message ?? 'Unable to save planning preferences.')
  }

  return data as PlannerPreferences
}
