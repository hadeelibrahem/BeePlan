import { API_BASE_URL, apiFetch, readJsonOrThrow } from './apiClient'

export type DailyPlanItem = { id: string; type: 'task' | 'reminder' | 'break' | 'calendar'; taskId?: string; reminderId?: string; title: string; startTime: string; endTime: string; durationMinutes: number; priority: 'low' | 'medium' | 'high' | 'urgent'; category?: string; isFocusTask?: boolean; locked?: boolean; rationale?: string }
export type UnscheduledItem = { taskId?: string; reminderId?: string; title: string; reason: string; status: string; reasonCode: string; estimatedMinutes?: number; priority?: 'low' | 'medium' | 'high' | 'urgent'; deadline?: string; suggestedDate?: string }
export type DailyPlan = { date: string; generatedAt: string; source: 'ai' | 'fallback'; workingHours: { start: string; end: string }; summary: string; sections: Record<'morning' | 'afternoon' | 'evening' | 'night', DailyPlanItem[]>; unscheduled: UnscheduledItem[]; capacity: { availableMinutes: number; requestedMinutes: number; scheduledMinutes: number; postponedMinutes: number; scheduledTaskCount: number; postponedTaskCount: number; freeMinutes: number; maxDailyWorkMinutes: number; emergencyBufferMinutes: number } }
export type PlanAcceptance = { date: string; plan: DailyPlan; acceptedAt: string }
export type EnergyLevel = 'high' | 'medium' | 'low'
export type TimeWindow = { start: string; end: string }
export type PlannerPreferences = { focusStartTime: string; focusEndTime: string; workBlockMinutes: number; breakMinutes: number; energy: { morning: EnergyLevel; afternoon: EnergyLevel; evening: EnergyLevel; night: EnergyLevel }; scheduleHardTasksInFocus: boolean; finishStartedFirst: boolean; groupSimilarTasks: boolean; bufferBeforeMeetings: boolean; bufferMinutes: number; maxDailyWorkMinutes: number; emergencyBufferMinutes: number; sleep: TimeWindow; lunch: TimeWindow; unavailableHours: TimeWindow[]; note: string }

async function request<T>(accessToken: string, path: string, init?: RequestInit) {
  const response = await apiFetch(path, { ...init, headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', ...init?.headers } })
  return readJsonOrThrow<T>(response, `${API_BASE_URL}${path}`)
}

export function generateDailyPlan(accessToken: string, date: string) { return request<DailyPlan>(accessToken, '/ai/planner/daily', { method: 'POST', body: JSON.stringify({ date, currentTime: new Date().toTimeString().slice(0, 5) }) }) }
export function acceptDailyPlan(accessToken: string, plan: DailyPlan) { return request<PlanAcceptance>(accessToken, '/ai/planner/daily/accept', { method: 'POST', body: JSON.stringify({ plan }) }) }
export function getDailyPlanAcceptance(accessToken: string, date: string) { return request<PlanAcceptance | null>(accessToken, `/ai/planner/daily/accept?date=${encodeURIComponent(date)}`) }
export function getPlannerPreferences(accessToken: string) { return request<PlannerPreferences>(accessToken, '/ai/planner/preferences') }
export function updatePlannerPreferences(accessToken: string, preferences: PlannerPreferences) { return request<PlannerPreferences>(accessToken, '/ai/planner/preferences', { method: 'PUT', body: JSON.stringify(preferences) }) }
