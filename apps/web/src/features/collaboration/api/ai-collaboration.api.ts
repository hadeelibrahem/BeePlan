import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../../../lib/queryKeys'

const apiUrl = (import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3000').replace(/\/+$/, '')

export type CapacityBand = 'light' | 'moderate' | 'busy'

export type MemberCapacity = {
  userId: string
  displayName: string
  band: CapacityBand
  loadPercent: number
}

export type CapacityResponse = { members: MemberCapacity[] }

export type TodayItem = {
  id: string
  title: string
  status: string
  dueDate: string | null
}

export type TodayMember = {
  userId: string
  displayName: string
  items: TodayItem[]
}

export type TodayResponse = {
  goal: string
  members: TodayMember[]
  sharedItems: TodayItem[]
}

export type ProgressMember = {
  userId: string
  displayName: string
  completedCount: number
  totalCount: number
  percent: number
}

export type ProgressResponse = {
  overallPercent: number
  completedCount: number
  totalCount: number
  members: ProgressMember[]
}

export type Milestone = { id: string; title: string; date: string }

export type TimelineResponse = {
  today: string
  deadline: string | null
  milestones: Milestone[]
  bufferDay: string | null
}

export type SuggestionKind =
  | 'ahead_of_pace'
  | 'inactive_member'
  | 'deadline_risk'
  | 'workload_imbalance'
export type SuggestionStatus = 'pending' | 'approved' | 'dismissed' | 'auto_resolved'

export type Suggestion = {
  id: string
  kind: SuggestionKind
  status: SuggestionStatus
  targetUserId: string | null
  title: string
  message: string
  reason: string
  createdAt: string
  resolvedAt: string | null
}

export type SuggestionsResponse = { items: Suggestion[] }

/** Thin fetch wrapper mirroring features/collaboration/api/collaboration.api.ts. */
async function request<T>(path: string, accessToken: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${apiUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        ...init?.headers,
      },
    })
  } catch {
    throw new Error('network')
  }

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const message = Array.isArray(data?.message) ? data.message.join(', ') : data?.message
    const error = new Error(message ?? 'request_failed') as Error & { status?: number }
    error.status = response.status
    throw error
  }
  return data as T
}

// --- Plain fetch wrappers ---------------------------------------------------

export function getCapacity(taskId: string, accessToken: string) {
  return request<CapacityResponse>(`/tasks/${taskId}/ai/collaboration/capacity`, accessToken)
}

export function getToday(taskId: string, accessToken: string) {
  return request<TodayResponse>(`/tasks/${taskId}/ai/collaboration/today`, accessToken)
}

export function getProgress(taskId: string, accessToken: string) {
  return request<ProgressResponse>(`/tasks/${taskId}/ai/collaboration/progress`, accessToken)
}

export function getTimeline(taskId: string, accessToken: string) {
  return request<TimelineResponse>(`/tasks/${taskId}/ai/collaboration/timeline`, accessToken)
}

export function getSuggestions(taskId: string, accessToken: string) {
  return request<SuggestionsResponse>(`/tasks/${taskId}/ai/collaboration/suggestions`, accessToken)
}

export function approveSuggestion(taskId: string, recommendationId: string, accessToken: string) {
  return request<{ success: true }>(
    `/tasks/${taskId}/ai/collaboration/suggestions/${recommendationId}/approve`,
    accessToken,
    { method: 'POST' },
  )
}

export function dismissSuggestion(taskId: string, recommendationId: string, accessToken: string) {
  return request<{ success: true }>(
    `/tasks/${taskId}/ai/collaboration/suggestions/${recommendationId}/dismiss`,
    accessToken,
    { method: 'POST' },
  )
}

// --- React Query hooks -------------------------------------------------------
// staleTime/refetch behavior comes from the app-wide QueryClient default
// (staleTime 30s, refetch on window focus) — no extra polling here.

export function useCapacityQuery(taskId: string, accessToken: string) {
  return useQuery({
    queryKey: queryKeys.aiCollaboration.capacity(taskId),
    queryFn: () => getCapacity(taskId, accessToken),
    enabled: Boolean(taskId && accessToken),
  })
}

export function useTodayQuery(taskId: string, accessToken: string) {
  return useQuery({
    queryKey: queryKeys.aiCollaboration.today(taskId),
    queryFn: () => getToday(taskId, accessToken),
    enabled: Boolean(taskId && accessToken),
  })
}

export function useProgressQuery(taskId: string, accessToken: string) {
  return useQuery({
    queryKey: queryKeys.aiCollaboration.progress(taskId),
    queryFn: () => getProgress(taskId, accessToken),
    enabled: Boolean(taskId && accessToken),
  })
}

export function useTimelineQuery(taskId: string, accessToken: string) {
  return useQuery({
    queryKey: queryKeys.aiCollaboration.timeline(taskId),
    queryFn: () => getTimeline(taskId, accessToken),
    enabled: Boolean(taskId && accessToken),
  })
}

export function useSuggestionsQuery(taskId: string, accessToken: string) {
  return useQuery({
    queryKey: queryKeys.aiCollaboration.suggestions(taskId),
    queryFn: () => getSuggestions(taskId, accessToken),
    enabled: Boolean(taskId && accessToken),
  })
}

/** Invalidates every AI-collaboration query for a task, plus the task detail
 * (subtasks may have changed). Shared by approve/dismiss/check-in/apply-plan. */
function invalidateAiCollaboration(
  queryClient: ReturnType<typeof useQueryClient>,
  taskId: string,
  opts: { includeTaskDetail?: boolean } = {},
) {
  queryClient.invalidateQueries({ queryKey: queryKeys.aiCollaboration.capacity(taskId) })
  queryClient.invalidateQueries({ queryKey: queryKeys.aiCollaboration.today(taskId) })
  queryClient.invalidateQueries({ queryKey: queryKeys.aiCollaboration.progress(taskId) })
  queryClient.invalidateQueries({ queryKey: queryKeys.aiCollaboration.timeline(taskId) })
  queryClient.invalidateQueries({ queryKey: queryKeys.aiCollaboration.suggestions(taskId) })
  if (opts.includeTaskDetail) {
    queryClient.invalidateQueries({ queryKey: queryKeys.tasks.detail(taskId) })
  }
}

export function useApproveSuggestionMutation(taskId: string, accessToken: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (recommendationId: string) => approveSuggestion(taskId, recommendationId, accessToken),
    onSuccess: () => invalidateAiCollaboration(queryClient, taskId, { includeTaskDetail: true }),
  })
}

export function useDismissSuggestionMutation(taskId: string, accessToken: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (recommendationId: string) => dismissSuggestion(taskId, recommendationId, accessToken),
    onSuccess: () => invalidateAiCollaboration(queryClient, taskId),
  })
}

/** Shared invalidation hook for generate/apply-plan and subtask check-ins,
 * which call the existing collaboration-plan / subtask endpoints directly. */
export function useInvalidateAiCollaboration(taskId: string) {
  const queryClient = useQueryClient()
  return (opts: { includeTaskDetail?: boolean } = {}) =>
    invalidateAiCollaboration(queryClient, taskId, opts)
}
