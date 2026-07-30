import { useQuery } from '@tanstack/react-query';
import { API_BASE_URL, apiFetch, readJsonOrThrow } from '../../../lib/apiClient';
import { getAuthToken } from '../../../lib/authToken';
import { queryKeys } from '../../../lib/queryKeys';

// --- Shared contract (mirrors apps/api .../project-plan/project-plan.logic.ts
// and the web copy byte-for-byte). No shared package exists in this repo, so
// the backend contract is duplicated per client by convention.

export type PlanEntityType = 'task' | 'subtask';
export type PlanDependencyType = 'subtask' | 'cross_task';
export type PlanAssignee = { userId: string; displayName: string } | null;
export type FocusSummary = { sessionCount: number; spentMinutes: number };

export type ProjectPlanNode = {
  id: string;
  entityType: PlanEntityType;
  parentTaskId: string | null;
  title: string;
  status: string;
  assignee: PlanAssignee;
  estimatedMinutes: number | null;
  actualMinutes: number | null;
  remainingMinutes: number | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  forecastStart: string | null;
  forecastEnd: string | null;
  dueDate: string | null;
  progressPercent: number;
  isBlocked: boolean;
  blockedByIds: string[];
  blockingIds: string[];
  focusSummary: FocusSummary | null;
  isExternal: boolean;
  isGroup: boolean;
  layer: number;
  inCycle: boolean;
  isUnscheduled: boolean;
};

export type ProjectPlanEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  dependencyType: PlanDependencyType;
};

export type ProjectPlanWarning = {
  code: 'cycle' | 'dangling_dependency' | 'self_dependency';
  message: string;
  nodeIds: string[];
};

export type CriticalPath = {
  status: 'available' | 'unavailable';
  itemIds: string[];
  durationMinutes: number | null;
  projectedCompletion: string | null;
  reason: string | null;
};

export type NodeForecastStatus = 'scheduled' | 'unscheduled' | 'complete' | 'in_cycle';

export type ProjectPlanSchedule = {
  // Critical Path Method (present only when Critical Path is available).
  earliestStart?: string;
  earliestFinish?: string;
  latestStart?: string;
  latestFinish?: string;
  totalFloatMinutes?: number;
  isCritical?: boolean;
  // Resource-Aware Forecast (present for every execution item).
  forecastStart?: string | null;
  forecastEnd?: string | null;
  forecastStatus?: NodeForecastStatus;
  forecastReason?: string | null;
  resourceConflictMinutes?: number;
  assigneeId?: string | null;
};

export type ForecastStatus = 'available' | 'unavailable' | 'partial';

export type ResourceForecast = {
  status: ForecastStatus;
  generatedAt: string;
  projectedCompletion: string | null;
  deadline: string | null;
  delayMinutes: number;
  delayDays: number;
  capacityShortfallMinutes: number;
  unscheduledItemIds: string[];
  bottleneckAssignee: { assigneeId: string; assigneeName: string; overloadMinutes: number } | null;
  fallbackPolicy: string | null;
  reasons: string[];
};

export type ResourceLane = {
  assigneeId: string;
  assigneeName: string;
  availableMinutes: number;
  scheduledMinutes: number;
  utilisationPercent: number;
  overloadMinutes: number;
};

export type ProjectPlan = {
  taskId: string;
  generatedAt: string;
  nodes: ProjectPlanNode[];
  edges: ProjectPlanEdge[];
  warnings: ProjectPlanWarning[];
  criticalPath: CriticalPath;
  scheduling: Record<string, ProjectPlanSchedule>;
  forecast: ResourceForecast;
  resourceLanes: ResourceLane[];
};

async function apiRequest<T>(path: string): Promise<T> {
  const token = getAuthToken();
  const response = await apiFetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  return readJsonOrThrow<T>(response, `${API_BASE_URL}${path}`);
}

export function getProjectPlan(taskId: string) {
  return apiRequest<ProjectPlan>(`/tasks/${taskId}/project-plan`);
}

export function useProjectPlanQuery(taskId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.aiCollaboration.projectPlan(taskId ?? ''),
    queryFn: () => getProjectPlan(taskId as string),
    enabled: Boolean(taskId),
  });
}
