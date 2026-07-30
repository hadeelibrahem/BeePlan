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

export type TeamMemberStatus = 'available' | 'balanced' | 'heavy' | 'over_capacity'
export type TeamHealth = 'healthy' | 'balanced' | 'strained' | 'at_risk'
export type TeamRole = 'owner' | 'editor' | 'viewer'

// Mirrors apps/api .../team-insights.service.ts. Every figure is backend-derived
// from the shared project plan (Critical Path + Resource Forecast + Resource
// Lanes); the client only renders and filters.
export type TeamInsightsMember = {
  userId: string
  name: string
  avatarUrl: string | null
  role: TeamRole
  status: TeamMemberStatus
  utilisationPercent: number
  remainingMinutes: number
  availableMinutes: number
  overloadMinutes: number
  actualMinutes: number
  completedMinutes: number
  assignedItemCount: number
  completedItemCount: number
  readyItemCount: number
  blockedItemCount: number
  criticalItemCount: number
  futureItemCount: number
  unscheduledItemCount: number
  forecastDelayMinutes: number
  isBottleneck: boolean
}

export type TeamInsightsSummary = {
  health: TeamHealth
  balancePercent: number
  remainingMinutes: number
  availableMinutes: number
  capacityShortfallMinutes: number
  forecastCompletion: string | null
  forecastDelay: { minutes: number; days: number }
  overloadedCount: number
  availableCount: number
  blockedCriticalCount: number
  memberCount: number
  bottleneckUserId: string | null
  unassigned: { itemCount: number; remainingMinutes: number }
}

export type TeamInsights = {
  generatedAt: string
  viewerRole: TeamRole
  summary: TeamInsightsSummary
  members: TeamInsightsMember[]
  warnings: string[]
  formulaVersion: string
}

// --- Project Health (mirrors apps/api .../project-health.logic.ts) -----------

export type HealthStatus = 'healthy' | 'balanced' | 'warning' | 'at_risk' | 'critical' | 'no_data'
export type MetricHealth = {
  score: number | null
  status: HealthStatus
  reason: string
  details: Record<string, number | string | boolean | null>
}
export type HealthContributor = { tone: 'positive' | 'negative'; text: string }
export type HealthWarning = {
  group: 'Critical' | 'Blocked' | 'Capacity' | 'Forecast' | 'Focus' | 'Assignments' | 'Dependency'
  severity: 'critical' | 'warning'
  message: string
  link: 'plan' | 'team' | 'health'
}
export type ProjectHealthReport = {
  overall: MetricHealth
  schedule: MetricHealth
  capacity: MetricHealth
  dependency: MetricHealth
  execution: MetricHealth
  focus: MetricHealth
  collaboration: MetricHealth
  contributors: { positive: HealthContributor[]; negative: HealthContributor[] }
  warnings: HealthWarning[]
  trend: { available: boolean; points: { label: string; score: number }[]; reason: string | null }
  generatedAt: string
  formulaVersion: string
  viewerRole: TeamRole
}

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

// --- AI decision loop -------------------------------------------------------
// Mirrors apps/api .../recommendation-detail.logic.ts. Every field is produced
// by the backend from the existing deterministic detectors; the client renders
// and navigates only — no recommendation logic lives here.

export type RecommendationPerson = { userId: string; displayName: string }

export type RecommendationAffectedItem = {
  subtaskId: string
  title: string
  status: string
  isComplete: boolean
  assignee: RecommendationPerson | null
  estimatedDurationMinutes: number | null
  startDate: string | null
  dueDate: string | null
}

export type AffectedMemberRelation = 'subject' | 'from' | 'to'
export type RecommendationAffectedMember = RecommendationPerson & { relation: AffectedMemberRelation }

export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'unavailable'
/** A level with a stated reason — never a percentage. */
export type RecommendationConfidence = { level: ConfidenceLevel; reason: string; basis: string[] }

/** Why a recommendation left "pending" without a user acting on it. */
export type ResolutionReason =
  | 'completed'
  | 'already_applied'
  | 'not_applicable'
  | 'missing_estimate'
  | 'no_impact'
  | 'forecast_conflict'
  | 'health_conflict'
  | 'critical_path_conflict'
  | 'regression'
  | 'superseded'

/** One metric that actually changes, measured by the shared simulation. */
export type ImpactMetric = {
  key: string
  label: string
  unit: DeltaUnit
  before: number | null
  after: number | null
  direction: DeltaDirection
}

export type RecommendationImpact = {
  /** Only metrics that move — never a row saying "no change". */
  metrics: ImpactMetric[]
  forecastDateBefore: string | null
  forecastDateAfter: string | null
  summary: string
}

/** Filters a deep-link should apply on the destination tab. */
export type PlanFocus = {
  itemIds?: string[]
  memberId?: string
  blockedOnly?: boolean
  status?: string
}

export type RecommendationNavigation = {
  tab: 'plan' | 'team' | 'health'
  label: string
  focus: PlanFocus
}

export type RecommendationExplanation = {
  problem: string
  detection: string
  expectedImprovement: string
  evidence: string[]
}

export type PlanChangeDescription = {
  subtaskId: string
  subtaskTitle: string
  kind: 'reassign' | 'reschedule'
  summary: string
}

export type DetailedRecommendation = Suggestion & {
  kindLabel: string
  /** Set when the card was auto-resolved by the validation pipeline. */
  resolutionReason: ResolutionReason | null
  resolutionLabel: string | null
  target: RecommendationPerson | null
  explanation: RecommendationExplanation
  confidence: RecommendationConfidence
  /** Measured before/after for metrics that change. Null on resolved cards. */
  impact: RecommendationImpact | null
  affectedItems: RecommendationAffectedItem[]
  affectedMembers: RecommendationAffectedMember[]
  changes: PlanChangeDescription[]
  navigation: RecommendationNavigation
  blockers: string[]
  canApprove: boolean
  canDismiss: boolean
  canPreview: boolean
}

export type SuggestionsResponse = { items: DetailedRecommendation[]; viewerRole: TeamRole }

// --- Preview (before / after) -----------------------------------------------

export type ForecastSnapshot = {
  status: 'available' | 'partial' | 'unavailable'
  projectedCompletion: string | null
  deadline: string | null
  delayMinutes: number
  delayDays: number
  capacityShortfallMinutes: number
  unscheduledItemCount: number
  bottleneck: { assigneeId: string; assigneeName: string; overloadMinutes: number } | null
}

export type HealthSnapshot = {
  overallScore: number | null
  overallStatus: HealthStatus
  scheduleScore: number | null
  capacityScore: number | null
  dependencyScore: number | null
  executionScore: number | null
  collaborationScore: number | null
}

export type CapacityMemberSnapshot = {
  userId: string
  displayName: string
  utilisationPercent: number
  remainingMinutes: number
  overloadMinutes: number
  isOverloaded: boolean
}

export type CapacitySnapshot = {
  balancePercent: number
  overloadedCount: number
  availableCount: number
  memberCount: number
  remainingMinutes: number
  availableMinutes: number
  members: CapacityMemberSnapshot[]
}

export type CriticalWorkSnapshot = {
  status: 'available' | 'unavailable'
  itemCount: number
  blockedCount: number
  durationMinutes: number | null
  projectedCompletion: string | null
}

export type WorkSnapshot = {
  blockedItemCount: number
  readyItemCount: number
  openItemCount: number
}

export type PreviewSnapshot = {
  forecast: ForecastSnapshot
  health: HealthSnapshot
  capacity: CapacitySnapshot
  criticalWork: CriticalWorkSnapshot
  work: WorkSnapshot
}

export type DeltaDirection = 'better' | 'worse' | 'unchanged'
export type DeltaUnit = 'days' | 'minutes' | 'points' | 'count' | 'percent'

export type PreviewDelta = {
  key: string
  label: string
  unit: DeltaUnit
  before: number | null
  after: number | null
  change: number | null
  direction: DeltaDirection
}

export type RecommendationPreview = {
  recommendation: DetailedRecommendation
  before: PreviewSnapshot
  after: PreviewSnapshot
  deltas: PreviewDelta[]
  summary: string
  isNoOp: boolean
  generatedAt: string
}

// --- Overview (command-centre aggregation) ----------------------------------

export type OverviewHealthStatus = 'complete' | 'on_track' | 'at_risk' | 'needs_attention'
export type OverviewHealthTone = 'success' | 'positive' | 'warning' | 'danger'
export type ProjectHealth = { status: OverviewHealthStatus; tone: OverviewHealthTone }

export type DoThisNow = {
  kind: 'subtask' | 'task'
  taskId: string
  subtaskId: string | null
  title: string
  parentTaskTitle: string
  assignee: { userId: string; displayName: string } | null
  estimatedRemainingMinutes: number | null
  dueDate: string | null
  blocksCount: number
  status: string
  isBlocked: boolean
  isOverdue: boolean
  canStartFocus: boolean
}

export type OverviewAlertLink = 'health' | 'plan' | 'team'
export type OverviewAlert = {
  id: string
  kind: string
  severity: 'critical' | 'warning'
  title: string
  reason: string
  impact: string
  link: OverviewAlertLink
  /** Backend-owned filters the linked tab should apply (e.g. blocked items only). */
  focus?: PlanFocus
}

export type PlanSnapshot = {
  remainingEstimatedMinutes: number | null
  blockedCount: number
  criticalPathSummary: string | null
  forecastDate: string | null
  deadline: string | null
  availableCapacityMemberCount: number
}

export type TeamSnapshot = {
  contributorCount: number
  balance: 'balanced' | 'uneven' | null
  mostOverloaded: { userId: string; displayName: string; loadPercent: number } | null
  mostAvailable: { userId: string; displayName: string; loadPercent: number } | null
}

export type CollaborationOverview = {
  viewerRole: 'owner' | 'editor' | 'viewer'
  status: {
    overallPercent: number
    completedCount: number
    totalCount: number
    pendingActionCount: number
    health: ProjectHealth | null
    deadline: string | null
    isDeadlineAtRisk: boolean
    teamMemberCount: number
  }
  doThisNow: DoThisNow | null
  alerts: OverviewAlert[]
  plan: PlanSnapshot
  team: TeamSnapshot
}

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

export function getOverview(taskId: string, accessToken: string) {
  return request<CollaborationOverview>(`/tasks/${taskId}/ai/collaboration/overview`, accessToken)
}

export function getCapacity(taskId: string, accessToken: string) {
  return request<CapacityResponse>(`/tasks/${taskId}/ai/collaboration/capacity`, accessToken)
}
export function getTeamInsights(taskId: string, accessToken: string) { return request<TeamInsights>(`/tasks/${taskId}/ai/collaboration/team`, accessToken) }
export function getProjectHealth(taskId: string, accessToken: string) { return request<ProjectHealthReport>(`/tasks/${taskId}/ai/collaboration/health`, accessToken) }

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

/** Before/after impact of approving. Read-only — the server mutates nothing here. */
export function getSuggestionPreview(taskId: string, recommendationId: string, accessToken: string) {
  return request<RecommendationPreview>(
    `/tasks/${taskId}/ai/collaboration/suggestions/${recommendationId}/preview`,
    accessToken,
  )
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

export function useOverviewQuery(taskId: string, accessToken: string) {
  return useQuery({
    queryKey: queryKeys.aiCollaboration.overview(taskId),
    queryFn: () => getOverview(taskId, accessToken),
    enabled: Boolean(taskId && accessToken),
  })
}

export function useCapacityQuery(taskId: string, accessToken: string) {
  return useQuery({
    queryKey: queryKeys.aiCollaboration.capacity(taskId),
    queryFn: () => getCapacity(taskId, accessToken),
    enabled: Boolean(taskId && accessToken),
  })
}
export function useTeamInsightsQuery(taskId: string, accessToken: string) { return useQuery({ queryKey: queryKeys.aiCollaboration.team(taskId), queryFn: () => getTeamInsights(taskId, accessToken), enabled: Boolean(taskId && accessToken) }) }
export function useProjectHealthQuery(taskId: string, accessToken: string) { return useQuery({ queryKey: queryKeys.aiCollaboration.health(taskId), queryFn: () => getProjectHealth(taskId, accessToken), enabled: Boolean(taskId && accessToken) }) }

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

/** Fetched only while a recommendation is open for review — previews are expensive. */
export function useSuggestionPreviewQuery(
  taskId: string,
  recommendationId: string | null,
  accessToken: string,
) {
  return useQuery({
    queryKey: queryKeys.aiCollaboration.suggestionPreview(taskId, recommendationId ?? ''),
    queryFn: () => getSuggestionPreview(taskId, recommendationId!, accessToken),
    enabled: Boolean(taskId && accessToken && recommendationId),
  })
}

/** Invalidates every AI-collaboration query for a task, plus the task detail
 * (subtasks may have changed). Shared by approve/dismiss/check-in/apply-plan. */
function invalidateAiCollaboration(
  queryClient: ReturnType<typeof useQueryClient>,
  taskId: string,
  opts: { includeTaskDetail?: boolean } = {},
) {
  queryClient.invalidateQueries({ queryKey: queryKeys.aiCollaboration.overview(taskId) })
  queryClient.invalidateQueries({ queryKey: queryKeys.aiCollaboration.capacity(taskId) })
  queryClient.invalidateQueries({ queryKey: queryKeys.aiCollaboration.team(taskId) })
  queryClient.invalidateQueries({ queryKey: queryKeys.aiCollaboration.today(taskId) })
  queryClient.invalidateQueries({ queryKey: queryKeys.aiCollaboration.progress(taskId) })
  queryClient.invalidateQueries({ queryKey: queryKeys.aiCollaboration.timeline(taskId) })
  queryClient.invalidateQueries({ queryKey: queryKeys.aiCollaboration.suggestions(taskId) })
  // Prefix match: drops every cached preview for this task, whose before/after
  // is stale the moment any subtask changes.
  queryClient.invalidateQueries({ queryKey: ['aiCollaboration', 'suggestionPreview', taskId] })
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
