const apiUrl = (import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3000').replace(/\/+$/, '')

export type PlanPriority = 'low' | 'medium' | 'high' | 'urgent'

export type WorkloadDistribution = 'equal' | 'availability' | 'role' | 'custom'
export type TaskGranularity = 'coarse' | 'medium' | 'fine'

// 'shared_outcome': exam prep / studying / interview prep / joint revision /
// certification — every participant must cover the full scope; learning
// responsibility can't be divided the way ordinary project work can.
// 'divisible': ordinary project work (docs, screens, features, reports).
export type CollaborationTaskType = 'shared_outcome' | 'divisible'
export type TaskTypeOverride = 'auto' | CollaborationTaskType

export type ActivityType =
  | 'preparation' // creating a study resource
  | 'study_review' // studying/reviewing material (own or a teammate's)
  | 'practice' // full-scope practice questions/exercises
  | 'error_analysis' // reviewing one's own mistakes and revising weak areas
  | 'shared_session' // a synchronous joint session — full duration per attendee
  | 'production' // ordinary divisible-task output
  | 'other'

export type CollaborationPlanPreferencesInput = {
  workloadDistribution?: WorkloadDistribution
  taskType?: TaskTypeOverride
  includeOwner?: boolean
  maxWorkloadItemsPerPerson?: number
  allowParallelWork?: boolean
  addReviewSteps?: boolean
  addBufferTime?: boolean
  taskGranularity?: TaskGranularity
  notes?: string
}

export type CollaborationPlanItem = {
  proposalId: string
  title: string
  description: string
  assigneeUserId: string | null
  assigneeDisplayName: string | null
  estimatedDurationMinutes: number
  suggestedStart: string | null
  suggestedDue: string | null
  priority: PlanPriority
  order: number
  dependsOnProposalIds: string[]
  canRunInParallel: boolean
  reason: string
  assumptions: string[]
  warnings: string[]
  activityType: ActivityType
  sharedSessionId: string | null
}

export type MemberWorkload = {
  userId: string
  displayName: string
  itemCount: number
  totalEstimatedMinutes: number
}

export type CollaborationPlanProposal = {
  planId: string
  generatedAt: string
  source: 'ai' | 'fallback'
  taskCollaborationType: CollaborationTaskType
  recoveryMode: boolean
  summary: string
  items: CollaborationPlanItem[]
  workloadByMember: MemberWorkload[]
  totalEstimatedMinutes: number
  deadlineFeasible: boolean
  risks: string[]
  unassignedWork: string[]
  reviewMilestone: { title: string; suggestedDate: string | null } | null
  suggestedBufferMinutes: number | null
  warnings: string[]
  assumptions: string[]
}

export type ApplyPlanItemInput = {
  proposalId: string
  title: string
  description?: string
  assigneeUserId?: string | null
  estimatedDurationMinutes?: number
  suggestedStart?: string
  suggestedDue?: string
  priority?: PlanPriority
  order?: number
  dependsOnProposalIds?: string[]
  canRunInParallel?: boolean
  // Carried through so the backend can compute apply-time semantic identity
  // (participant + stage + subject scope) and provenance instead of guessing
  // from title text — required for regenerate-and-reapply to replace the
  // prior plan instead of appending duplicates.
  activityType?: ActivityType
  sharedSessionId?: string | null
}

export type ApplyItemError = { proposalId: string; error: string }

export type ApplyCollaborationPlanResult = {
  success: true
  created: { subtaskIds: string[]; dependencyCount: number }
  itemErrors: ApplyItemError[]
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
    const error = new Error(message ?? 'request_failed') as Error & { status?: number; itemErrors?: ApplyItemError[] }
    error.status = response.status
    if (Array.isArray(data?.itemErrors)) error.itemErrors = data.itemErrors
    throw error
  }
  return data as T
}

export function generateCollaborationPlan(
  taskId: string,
  payload: { selectedMemberIds: string[]; preferences?: CollaborationPlanPreferencesInput },
  accessToken: string,
) {
  return request<CollaborationPlanProposal>(`/tasks/${taskId}/ai/collaboration-plan`, accessToken, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function applyCollaborationPlan(
  taskId: string,
  planId: string,
  items: ApplyPlanItemInput[],
  accessToken: string,
) {
  return request<ApplyCollaborationPlanResult>(`/tasks/${taskId}/ai/collaboration-plan/apply`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ planId, items }),
  })
}
