const apiUrl = (import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3000').replace(/\/+$/, '')
const plannerRequestId = () => globalThis.crypto?.randomUUID?.() ?? `web-planner-${Date.now()}-${Math.random().toString(36).slice(2)}`

export type DailyPlanItem = {
  id: string
  type: 'task' | 'reminder' | 'break' | 'calendar'
  taskId?: string
  /** Set when this item schedules an incomplete subtask (in place of its parent). */
  subtaskId?: string
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
  selectionSource?: 'user' | 'autoFill' | 'scheduled'
}

export type PostponeStatus =
  | 'POSTPONED_CAPACITY'
  | 'BLOCKED_DEPENDENCY'
  | 'NO_VALID_TIME_SLOT'
  | 'INVALID_TASK_DATA'

export type PostponeReasonCode =
  | 'insufficient_capacity'
  | 'low_priority'
  | 'dependency_not_completed'
  | 'unavailable_time_window'
  | 'energy_mismatch'
  | 'meeting_reminder_conflict'
  | 'max_daily_work_limit'
  | 'sleep_lunch_unavailable_hours'
  | 'task_too_large'
  | 'invalid_task_data'

export type UnscheduledItem = {
  taskId?: string
  /** Set when the postponed item is an incomplete subtask, keeping its real identity. */
  subtaskId?: string
  reminderId?: string
  title: string
  reason: string
  status: PostponeStatus
  reasonCode: PostponeReasonCode
  estimatedMinutes?: number
  priority?: 'low' | 'medium' | 'high' | 'urgent'
  deadline?: string
  suggestedDate?: string
}

export type CapacitySummary = {
  availableMinutes: number
  requestedMinutes: number
  scheduledMinutes: number
  postponedMinutes: number
  scheduledTaskCount: number
  postponedTaskCount: number
  freeMinutes: number
  maxDailyWorkMinutes: number
  emergencyBufferMinutes: number
}

export type ScheduleConflict = {
  id: string
  task: {
    itemId: string
    taskId?: string
    subtaskId?: string
    title: string
    startTime: string
    endTime: string
    durationMinutes: number
    isFocusTask: boolean
  }
  commitment: { id: string; title: string; startTime: string; endTime: string }
  conflictMinutes: number
}

export type DailyPlan = {
  date: string
  generatedAt: string
  source: 'ai' | 'fallback'
  workingHours: { start: string; end: string }
  summary: string
  sections: Record<'morning' | 'afternoon' | 'evening' | 'night', DailyPlanItem[]>
  unscheduled: UnscheduledItem[]
  capacity: CapacitySummary
  conflicts: ScheduleConflict[]
  taskConflicts?: import('./tasksApi').TaskTimeConflict[]
  travelFeasibilityConflicts?: { type: 'travel_feasibility_conflict'; affectedItem: { id: string; title: string }; conflictingItem: { id: string; title: string } | null; requiredTravelDurationMinutes: number; requiredDeparture: string; availableGapMinutes: number; suggestedValidAlternative: string; fallbackUsed: boolean }[]
}

export type GenerateDailyPlanPayload = {
  regenerate?: boolean
  date?: string
  currentTime?: string
  timezone?: string
  mode?: 'selectedOnly' | 'selectedPlusAutoFill'
  selectedItems?: { taskId: string; subtaskId?: string | null }[]
  workingHours?: { start?: string; end?: string }
  lockedItems?: { taskId?: string; reminderId?: string; startTime: string; endTime: string }[]
}

export type PlannerCandidate = {
  taskId: string
  subtaskId: string | null
  id: string
  title: string
  priority: 'low' | 'medium' | 'high' | 'urgent'
  dueDate?: string
  estimatedMinutes: number
  scheduleReason?: string
  scheduleCategory?: 'scheduledToday' | 'overdue' | 'upcoming' | 'unscheduled'
  scheduledStartAt?: string
  isAutoEligibleToday?: boolean
  isManuallySelectable?: boolean
  blockedReason?: string | null
}
export type PlannerCandidates = { date: string; timezone?: string; availableMinutes: number; selectedItems: { taskId: string; subtaskId?: string | null }[]; items: PlannerCandidate[]; blockedItems: (PlannerCandidate & { reason: string; status: string })[] }

export async function getDailyPlannerCandidates(accessToken: string, date: string, timezone?: string) {
  const params = new URLSearchParams({ date, timezone: timezone ?? (Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC') })
  const response = await fetch(`${apiUrl}/ai/planner/daily/candidates?${params}`, { headers: { Authorization: `Bearer ${accessToken}` } })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.message ?? 'Unable to load planner candidates.')
  return data as PlannerCandidates
}

export async function saveDailyPlannerSelection(accessToken: string, payload: { date: string; timezone?: string; selectedItems: { taskId: string; subtaskId?: string | null }[] }) {
  const response = await fetch(`${apiUrl}/ai/planner/daily/selection`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` }, body: JSON.stringify(payload) })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.message ?? 'Unable to save planner selection.')
  return data as { selectedItems: { taskId: string; subtaskId?: string | null }[] }
}

export async function generateDailyPlan(accessToken: string, payload: GenerateDailyPlanPayload = {}) {
  const requestId = plannerRequestId()
  const requestPayload = { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', ...payload }
  const response = await fetch(`${apiUrl}/ai/planner/daily`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'X-Planner-Request-Id': requestId,
    },
    cache: 'no-store',
    body: JSON.stringify(requestPayload),
  })
  const data = await response.json().catch(() => null)

  if (!response.ok) {
    const message = Array.isArray(data?.message) ? data.message.join(', ') : data?.message
    throw new Error(message ?? 'Unable to generate today\'s plan.')
  }

  console.debug('[planner] generated response', { requestId, generationRequestId: data?.generationRequestId, generatedAt: data?.generatedAt, taskSessions: Object.values(data?.sections ?? {}).flat().filter((item: any) => item.type === 'task').length })
  return data as DailyPlan
}

export type PlanAcceptance = {
  date: string
  plan: DailyPlan
  acceptedAt: string
}

export async function acceptDailyPlan(accessToken: string, plan: DailyPlan) {
  const response = await fetch(`${apiUrl}/ai/planner/daily/accept`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
    body: JSON.stringify({ plan }),
  })
  const data = await response.json().catch(() => null)

  if (!response.ok) {
    const message = Array.isArray(data?.message) ? data.message.join(', ') : data?.message
    throw new Error(message ?? 'Unable to accept today\'s plan.')
  }

  return data as PlanAcceptance
}

export async function getDailyPlanAcceptance(accessToken: string, date: string) {
  const response = await fetch(`${apiUrl}/ai/planner/daily/accept?date=${encodeURIComponent(date)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const data = await response.json().catch(() => null)

  if (!response.ok) {
    const message = Array.isArray(data?.message) ? data.message.join(', ') : data?.message
    throw new Error(message ?? 'Unable to load plan acceptance.')
  }

  return (data ?? null) as PlanAcceptance | null
}

export async function skipCommitmentOccurrence(
  accessToken: string,
  commitmentId: string,
  date: string,
) {
  const response = await fetch(`${apiUrl}/context/commitments/${commitmentId}/skip`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ date }),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.message ?? 'Unable to skip this commitment for today.')
  return data as { commitmentId: string; date: string; skipped: true }
}

export async function resolveScheduleConflict(accessToken: string, payload: {
  conflictKey: string
  date: string
  taskId?: string
  commitmentId: string
  resolution: 'keep_commitment' | 'keep_task' | 'postpone_task' | 'cancel_task'
}) {
  const response = await fetch(`${apiUrl}/ai/planner/conflicts/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error('Unable to save conflict resolution.')
  return response.json() as Promise<{ conflictKey: string; lifecycle: 'resolved'; resolution: string }>
}

export type EnergyLevel = 'high' | 'medium' | 'low'

export type TimeWindow = { start: string; end: string; label?: string }

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
  maxDailyWorkMinutes: number
  emergencyBufferMinutes: number
  sleep: TimeWindow
  lunch: TimeWindow
  unavailableHours: TimeWindow[]
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
