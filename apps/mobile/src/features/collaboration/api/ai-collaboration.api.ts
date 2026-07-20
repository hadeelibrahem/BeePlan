import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API_BASE_URL, apiFetch, readJsonOrThrow } from '../../../lib/apiClient';
import { getAuthToken } from '../../../lib/authToken';
import { queryKeys } from '../../../lib/queryKeys';
import { updateSubtask, type ApiTask, type SubtaskPayload } from '../../../lib/tasksApi';
import {
  applyCollaborationPlan,
  generateCollaborationPlan,
  type ApplyCollaborationPlanResult,
  type ApplyPlanItemInput,
  type CollaborationPlanPreferencesInput,
  type CollaborationPlanProposal,
} from './ai-collaboration-planner.api';

// --- Types -------------------------------------------------------------

export type CapacityBand = 'light' | 'moderate' | 'busy';

export type CapacityMember = {
  userId: string;
  displayName: string;
  band: CapacityBand;
  loadPercent: number;
};

export type CapacityResponse = {
  members: CapacityMember[];
};

export type TodayItem = {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
};

export type TodayMember = {
  userId: string;
  displayName: string;
  items: TodayItem[];
};

export type TodayResponse = {
  goal: string;
  members: TodayMember[];
  sharedItems: TodayItem[];
};

export type ProgressMember = {
  userId: string;
  displayName: string;
  completedCount: number;
  totalCount: number;
  percent: number;
};

export type ProgressResponse = {
  overallPercent: number;
  completedCount: number;
  totalCount: number;
  members: ProgressMember[];
};

export type TimelineMilestone = {
  id: string;
  title: string;
  date: string;
};

export type TimelineResponse = {
  today: string;
  deadline: string | null;
  milestones: TimelineMilestone[];
  bufferDay: string | null;
};

export type SuggestionKind = 'ahead_of_pace' | 'inactive_member' | 'deadline_risk' | 'workload_imbalance';
export type SuggestionStatus = 'pending' | 'approved' | 'dismissed' | 'auto_resolved';

export type Suggestion = {
  id: string;
  kind: SuggestionKind;
  status: SuggestionStatus;
  targetUserId: string | null;
  title: string;
  message: string;
  reason: string;
  createdAt: string;
  resolvedAt: string | null;
};

export type SuggestionsResponse = {
  items: Suggestion[];
};

// --- Low-level requests --------------------------------------------------

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const response = await apiFetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  return readJsonOrThrow<T>(response, `${API_BASE_URL}${path}`);
}

export function getCapacity(taskId: string) {
  return apiRequest<CapacityResponse>(`/tasks/${taskId}/ai/collaboration/capacity`);
}

export function getToday(taskId: string) {
  return apiRequest<TodayResponse>(`/tasks/${taskId}/ai/collaboration/today`);
}

export function getProgress(taskId: string) {
  return apiRequest<ProgressResponse>(`/tasks/${taskId}/ai/collaboration/progress`);
}

export function getTimeline(taskId: string) {
  return apiRequest<TimelineResponse>(`/tasks/${taskId}/ai/collaboration/timeline`);
}

export function getSuggestions(taskId: string) {
  return apiRequest<SuggestionsResponse>(`/tasks/${taskId}/ai/collaboration/suggestions`);
}

export function approveSuggestion(taskId: string, recommendationId: string) {
  return apiRequest<{ success: true }>(
    `/tasks/${taskId}/ai/collaboration/suggestions/${recommendationId}/approve`,
    { method: 'POST' },
  );
}

export function dismissSuggestion(taskId: string, recommendationId: string) {
  return apiRequest<{ success: true }>(
    `/tasks/${taskId}/ai/collaboration/suggestions/${recommendationId}/dismiss`,
    { method: 'POST' },
  );
}

// --- React Query hooks -----------------------------------------------------
// Default staleTime/refetch behavior from the app's QueryClient is used as-is
// (refetch on mount/tab-focus) — no interval polling is added for this
// feature, per the mobile app's pull-based notification model.

export function useCapacityQuery(taskId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.aiCollaboration.capacity(taskId ?? ''),
    queryFn: () => getCapacity(taskId as string),
    enabled: Boolean(taskId),
  });
}

export function useTodayQuery(taskId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.aiCollaboration.today(taskId ?? ''),
    queryFn: () => getToday(taskId as string),
    enabled: Boolean(taskId),
  });
}

export function useProgressQuery(taskId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.aiCollaboration.progress(taskId ?? ''),
    queryFn: () => getProgress(taskId as string),
    enabled: Boolean(taskId),
  });
}

export function useTimelineQuery(taskId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.aiCollaboration.timeline(taskId ?? ''),
    queryFn: () => getTimeline(taskId as string),
    enabled: Boolean(taskId),
  });
}

export function useSuggestionsQuery(taskId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.aiCollaboration.suggestions(taskId ?? ''),
    queryFn: () => getSuggestions(taskId as string),
    enabled: Boolean(taskId),
  });
}

/** Invalidates every AI-collaboration read query for a task (used after any mutation that can change them). */
function invalidateAiCollaboration(queryClient: ReturnType<typeof useQueryClient>, taskId: string) {
  queryClient.invalidateQueries({ queryKey: queryKeys.aiCollaboration.capacity(taskId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.aiCollaboration.today(taskId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.aiCollaboration.progress(taskId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.aiCollaboration.timeline(taskId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.aiCollaboration.suggestions(taskId) });
}

export function useApproveSuggestionMutation(taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (recommendationId: string) => approveSuggestion(taskId, recommendationId),
    onSuccess: () => {
      invalidateAiCollaboration(queryClient, taskId);
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.detail(taskId) });
    },
  });
}

export function useDismissSuggestionMutation(taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (recommendationId: string) => dismissSuggestion(taskId, recommendationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.aiCollaboration.suggestions(taskId) });
    },
  });
}

/**
 * Thin wrapper around the existing (unchanged) generate-plan endpoint so
 * DistributionPanel gets the same loading/error handling shape as the other
 * AI Collaboration tabs. Does not invalidate anything — generating a
 * proposal has no server-side side effects until it is applied.
 */
export function useGenerateCollaborationPlanMutation(taskId: string) {
  return useMutation({
    mutationFn: (payload: { selectedMemberIds: string[]; preferences?: CollaborationPlanPreferencesInput }) =>
      generateCollaborationPlan(taskId, payload),
  });
}

/** Wraps the existing (unchanged) apply-plan endpoint; invalidates task detail + AI collaboration reads on success. */
export function useApplyCollaborationPlanMutation(taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, items }: { planId: string; items: ApplyPlanItemInput[] }): Promise<ApplyCollaborationPlanResult> =>
      applyCollaborationPlan(taskId, planId, items),
    onSuccess: (result) => {
      if (result.created.subtaskIds.length > 0) {
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks.detail(taskId) });
        invalidateAiCollaboration(queryClient, taskId);
      }
    },
  });
}

/** Check-in ("Done"/"Partial"/"Didn't do it") reuses the existing subtask PATCH endpoint. */
export function useCheckInSubtaskMutation(taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ subtaskId, payload }: { subtaskId: string; payload: SubtaskPayload }): Promise<ApiTask> =>
      updateSubtask(getAuthToken() ?? '', taskId, subtaskId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.detail(taskId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.aiCollaboration.today(taskId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.aiCollaboration.progress(taskId) });
    },
  });
}
