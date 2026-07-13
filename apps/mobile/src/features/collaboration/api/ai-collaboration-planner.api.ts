import { API_BASE_URL, apiFetch, readJsonOrThrow } from '../../../lib/apiClient';
import { getAuthToken } from '../../../lib/authToken';

export type PlanPriority = 'low' | 'medium' | 'high' | 'urgent';
export type WorkloadDistribution = 'equal' | 'availability' | 'role' | 'custom';
export type TaskGranularity = 'coarse' | 'medium' | 'fine';

// 'shared_outcome': exam prep / studying / interview prep / joint revision /
// certification — every participant must cover the full scope; learning
// responsibility can't be divided the way ordinary project work can.
// 'divisible': ordinary project work (docs, screens, features, reports).
export type CollaborationTaskType = 'shared_outcome' | 'divisible';
export type TaskTypeOverride = 'auto' | CollaborationTaskType;

export type ActivityType =
  | 'preparation' // creating a study resource
  | 'study_review' // studying/reviewing material (own or a teammate's)
  | 'practice' // full-scope practice questions/exercises
  | 'error_analysis' // reviewing one's own mistakes and revising weak areas
  | 'shared_session' // a synchronous joint session — full duration per attendee
  | 'production' // ordinary divisible-task output
  | 'other';

export type CollaborationPlanPreferencesInput = {
  workloadDistribution?: WorkloadDistribution;
  taskType?: TaskTypeOverride;
  includeOwner?: boolean;
  maxWorkloadItemsPerPerson?: number;
  allowParallelWork?: boolean;
  addReviewSteps?: boolean;
  addBufferTime?: boolean;
  taskGranularity?: TaskGranularity;
  notes?: string;
};

export type CollaborationPlanItem = {
  proposalId: string;
  title: string;
  description: string;
  assigneeUserId: string | null;
  assigneeDisplayName: string | null;
  estimatedDurationMinutes: number;
  suggestedStart: string | null;
  suggestedDue: string | null;
  priority: PlanPriority;
  order: number;
  dependsOnProposalIds: string[];
  canRunInParallel: boolean;
  reason: string;
  assumptions: string[];
  warnings: string[];
  activityType: ActivityType;
  sharedSessionId: string | null;
};

export type MemberWorkload = {
  userId: string;
  displayName: string;
  itemCount: number;
  totalEstimatedMinutes: number;
};

export type CollaborationPlanProposal = {
  planId: string;
  generatedAt: string;
  source: 'ai' | 'fallback';
  taskCollaborationType: CollaborationTaskType;
  recoveryMode: boolean;
  summary: string;
  items: CollaborationPlanItem[];
  workloadByMember: MemberWorkload[];
  totalEstimatedMinutes: number;
  deadlineFeasible: boolean;
  risks: string[];
  unassignedWork: string[];
  reviewMilestone: { title: string; suggestedDate: string | null } | null;
  suggestedBufferMinutes: number | null;
  warnings: string[];
  assumptions: string[];
};

export type ApplyPlanItemInput = {
  proposalId: string;
  title: string;
  description?: string;
  assigneeUserId?: string | null;
  estimatedDurationMinutes?: number;
  suggestedStart?: string;
  suggestedDue?: string;
  priority?: PlanPriority;
  order?: number;
  dependsOnProposalIds?: string[];
  canRunInParallel?: boolean;
  // Carried through so the backend can compute apply-time semantic identity
  // (participant + stage + subject scope) and provenance instead of guessing
  // from title text — required for regenerate-and-reapply to replace the
  // prior plan instead of appending duplicates.
  activityType?: ActivityType;
  sharedSessionId?: string | null;
};

export type ApplyItemError = { proposalId: string; error: string };

export type ApplyCollaborationPlanResult = {
  success: true;
  created: { subtaskIds: string[]; dependencyCount: number };
  itemErrors: ApplyItemError[];
};

// Must stay >= the backend's AI_COLLABORATION_TIMEOUT_MS (default 90s, see
// apps/api/.env.example) plus a margin for network latency — otherwise the
// client aborts a request the server would have completed successfully.
const GENERATE_TIMEOUT_MS = 100_000;

async function apiRequest<T>(path: string, init?: RequestInit, timeoutMs?: number): Promise<T> {
  const token = getAuthToken();
  const response = await apiFetch(
    path,
    {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    },
    timeoutMs,
  );
  return readJsonOrThrow<T>(response, `${API_BASE_URL}${path}`);
}

export function generateCollaborationPlan(
  taskId: string,
  payload: { selectedMemberIds: string[]; preferences?: CollaborationPlanPreferencesInput },
) {
  return apiRequest<CollaborationPlanProposal>(
    `/tasks/${taskId}/ai/collaboration-plan`,
    { method: 'POST', body: JSON.stringify(payload) },
    GENERATE_TIMEOUT_MS,
  );
}

export function applyCollaborationPlan(
  taskId: string,
  planId: string,
  items: ApplyPlanItemInput[],
) {
  return apiRequest<ApplyCollaborationPlanResult>(`/tasks/${taskId}/ai/collaboration-plan/apply`, {
    method: 'POST',
    body: JSON.stringify({ planId, items }),
  });
}
