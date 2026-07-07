import { API_BASE_URL, apiFetch, readJsonOrThrow } from './apiClient';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Linking } from 'react-native';

export type ApiTaskStatus = 'todo' | 'in_progress' | 'done' | 'missed';
export type ApiTaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export type ApiTaskLabel = {
  id: string;
  name: string;
};

export type ApiTaskAttachment = {
  id?: string;
  taskId?: string;
  name?: string;
  size?: string;
  url?: string;
  type?: string;
  fileName?: string;
  fileUrl?: string;
  previewUrl?: string;
  downloadUrl?: string;
  storagePath?: string;
  fileType?: string;
  fileSize?: number | string;
  uploadedAt?: string;
};

export type ApiTaskActivity = {
  id: string;
  action: string;
  description: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
};

export type ApiSubtask = {
  id: string;
  title: string;
  isDone: boolean;
  orderIndex: number;
  assignee?: string;
  dueDate?: string;
  status: string;
};

export type ApiDependency = {
  id: string;
  title: string;
  category: string;
  status: ApiTaskStatus;
  dueDate?: string;
  priority: ApiTaskPriority;
  progress: number;
};

export type ApiRecurrence = {
  frequency: 'Never' | 'Daily' | 'Weekly' | 'Monthly' | 'Yearly' | 'Custom';
  weekdays: string[];
  monthlyMode: 'sameDay' | 'lastDay';
  customInterval: number;
  customUnit: 'days' | 'weeks' | 'months';
  endType: 'never' | 'date' | 'occurrences';
  endDate?: string;
  occurrences: number;
};

export type UiRecurrence = Omit<ApiRecurrence, 'endType'> & {
  endType: 'never' | 'onDate' | 'after';
  endDate: string;
};

export type ApiTask = {
  id: string;
  title: string;
  description: string;
  priority: ApiTaskPriority;
  status: ApiTaskStatus;
  progress: number;
  dueDate?: string;
  dueTime: string;
  category: string;
  notes: string;
  estimatedTimeMinutes: number;
  spentTimeMinutes: number;
  remainingTimeMinutes: number;
  estimatedHours: number;
  spentHours: number;
  remainingHours: number;
  progressPercentage: number;
  reminderEnabled: boolean;
  reminderBeforeMinutes?: number;
  labels: string[];
  labelDetails?: ApiTaskLabel[];
  isFavorite: boolean;
  isFocusTask: boolean;
  isBlocked: boolean;
  dependenciesComplete: boolean;
  subtasks: ApiSubtask[];
  dependencies: ApiDependency[];
  recurrence: ApiRecurrence | null;
  activities: ApiTaskActivity[];
  createdAt: string;
  updatedAt: string;
  attachments: ApiTaskAttachment[];
};

export type TaskPayload = Partial<
  Pick<
    ApiTask,
    | 'title'
    | 'description'
    | 'priority'
    | 'status'
    | 'progress'
    | 'dueDate'
    | 'dueTime'
    | 'category'
    | 'notes'
    | 'estimatedTimeMinutes'
    | 'spentTimeMinutes'
    | 'remainingTimeMinutes'
    | 'reminderEnabled'
    | 'reminderBeforeMinutes'
    | 'labels'
    | 'isFavorite'
    | 'isFocusTask'
    | 'recurrence'
  >
>;

async function request<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (response.status === 204) return undefined as T;

  return readJsonOrThrow<T>(response, `${API_BASE_URL}${path}`);
}

export type TaskDueFilter = 'today' | 'upcoming' | 'overdue';

export type TaskFilters = {
  status?: ApiTaskStatus;
  priority?: ApiTaskPriority;
  category?: string;
  due?: TaskDueFilter;
  focus?: boolean;
  completed?: boolean;
  hasReminder?: boolean;
  search?: string;
};

export type TaskFilterSummary = {
  counts: {
    today: number;
    upcoming: number;
    overdue: number;
    focus: number;
    completed: number;
    highPriority: number;
  };
  categories: { name: string; count: number }[];
};

function buildTaskQuery(filters?: TaskFilters) {
  if (!filters) return '';

  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.priority) params.set('priority', filters.priority);
  if (filters.category) params.set('category', filters.category);
  if (filters.due) params.set('due', filters.due);
  if (filters.focus) params.set('focus', 'true');
  if (filters.completed) params.set('completed', 'true');
  if (filters.hasReminder) params.set('hasReminder', 'true');
  if (filters.search) params.set('search', filters.search);

  const query = params.toString();
  return query ? `?${query}` : '';
}

export type DashboardSummary = {
  todayTasks: number;
  completedTasks: number;
  highPriorityTasks: number;
  reminders: number;
  totalTasks: number;
  overallProgress: number;
};

export function getDashboardSummary(accessToken: string) {
  return request<DashboardSummary>(accessToken, '/dashboard/summary');
}

export function getTasks(accessToken: string, filters?: TaskFilters) {
  return request<ApiTask[]>(accessToken, `/tasks${buildTaskQuery(filters)}`);
}

export function getTaskFilterSummary(accessToken: string) {
  return request<TaskFilterSummary>(accessToken, '/tasks/filters/summary');
}

export function createTask(accessToken: string, payload: TaskPayload) {
  return request<ApiTask>(accessToken, '/tasks', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateTask(accessToken: string, taskId: string, payload: TaskPayload) {
  return request<ApiTask>(accessToken, `/tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function deleteTask(accessToken: string, taskId: string) {
  return request<void>(accessToken, `/tasks/${taskId}`, { method: 'DELETE' });
}

export function changeTaskStatus(
  accessToken: string,
  taskId: string,
  payload: { status: ApiTaskStatus; progress?: number; completionDate?: string; missedReason?: string },
) {
  return request<ApiTask>(accessToken, `/tasks/${taskId}/status`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function getTaskLabels(accessToken: string, taskId: string) {
  return request<ApiTaskLabel[]>(accessToken, `/tasks/${taskId}/labels`);
}

export function addTaskLabel(accessToken: string, taskId: string, name: string) {
  return request<ApiTaskLabel[]>(accessToken, `/tasks/${taskId}/labels`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export function removeTaskLabel(accessToken: string, taskId: string, labelId: string) {
  return request<ApiTaskLabel[]>(accessToken, `/tasks/${taskId}/labels/${encodeURIComponent(labelId)}`, {
    method: 'DELETE',
  });
}

export function updateTaskTimeEstimation(
  accessToken: string,
  taskId: string,
  payload: { estimatedHours: number; spentHours: number },
) {
  return request<{
    estimatedHours: number;
    spentHours: number;
    remainingHours: number;
    progressPercentage: number;
  }>(accessToken, `/tasks/${taskId}/time-estimation`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function getSubtasks(accessToken: string, taskId: string) {
  return request<ApiSubtask[]>(accessToken, `/tasks/${taskId}/subtasks`);
}

export function addSubtask(
  accessToken: string,
  taskId: string,
  payload: { title: string; isDone?: boolean; dueDate?: string; assignee?: string },
) {
  return request<ApiTask>(accessToken, `/tasks/${taskId}/subtasks`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function reorderSubtasks(accessToken: string, taskId: string, subtaskIds: string[]) {
  return request<ApiTask>(accessToken, `/tasks/${taskId}/subtasks/reorder`, {
    method: 'POST',
    body: JSON.stringify({ subtaskIds }),
  });
}

export function updateSubtask(
  accessToken: string,
  taskId: string,
  subtaskId: string,
  payload: Partial<ApiSubtask>,
) {
  return request<ApiTask>(accessToken, `/tasks/${taskId}/subtasks/${subtaskId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function deleteSubtask(accessToken: string, taskId: string, subtaskId: string) {
  return request<ApiTask>(accessToken, `/tasks/${taskId}/subtasks/${subtaskId}`, { method: 'DELETE' });
}

export function getDependencies(accessToken: string, taskId: string) {
  return request<ApiDependency[]>(accessToken, `/tasks/${taskId}/dependencies`);
}

export function addDependencies(accessToken: string, taskId: string, dependencyTaskIds: string[]) {
  return request<ApiTask>(accessToken, `/tasks/${taskId}/dependencies`, {
    method: 'POST',
    body: JSON.stringify({ dependencyTaskIds }),
  });
}

export function replaceDependency(
  accessToken: string,
  taskId: string,
  dependencyTaskId: string,
  replacementTaskId: string,
) {
  return request<ApiTask>(accessToken, `/tasks/${taskId}/dependencies/${dependencyTaskId}`, {
    method: 'PATCH',
    body: JSON.stringify({ replacementTaskId }),
  });
}

export function removeDependency(accessToken: string, taskId: string, dependencyTaskId: string) {
  return request<ApiTask>(accessToken, `/tasks/${taskId}/dependencies/${dependencyTaskId}`, { method: 'DELETE' });
}

export function getRecurrence(accessToken: string, taskId: string) {
  return request<ApiRecurrence | null>(accessToken, `/tasks/${taskId}/recurrence`);
}

export function saveRecurrence(accessToken: string, taskId: string, recurrence: ApiRecurrence) {
  return request<ApiTask>(accessToken, `/tasks/${taskId}/recurrence`, {
    method: 'PUT',
    body: JSON.stringify(recurrence),
  });
}

export function removeRecurrence(accessToken: string, taskId: string) {
  return request<ApiTask>(accessToken, `/tasks/${taskId}/recurrence`, { method: 'DELETE' });
}

export function getTaskActivity(accessToken: string, taskId: string) {
  return request<ApiTaskActivity[]>(accessToken, `/tasks/${taskId}/activity`);
}

export function getAttachments(accessToken: string, taskId: string) {
  return request<ApiTaskAttachment[]>(accessToken, `/tasks/${taskId}/attachments`);
}

export async function uploadAttachment(accessToken: string, taskId: string, file: { uri: string; name: string; type?: string }) {
  const path = `/tasks/${taskId}/attachments`;
  const url = `${API_BASE_URL}${path}`;
  const formData = new FormData();
  formData.append('file', {
    uri: file.uri,
    name: file.name,
    type: file.type ?? 'application/octet-stream',
  } as never);

  const response = await apiFetch(path, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: formData,
  });

  return readJsonOrThrow<ApiTaskAttachment>(response, url);
}

export function deleteAttachment(accessToken: string, taskId: string, attachmentId: string) {
  return request<void>(accessToken, `/tasks/${taskId}/attachments/${encodeURIComponent(attachmentId)}`, {
    method: 'DELETE',
  });
}

export async function openAttachment(accessToken: string, taskId: string, attachment: ApiTaskAttachment) {
  if (!attachment.id) {
    throw new Error('Unable to open attachment.');
  }

  const fileName = attachment.fileName ?? attachment.name ?? 'attachment';
  const safeName = fileName.replace(/[^a-z0-9._-]+/gi, '_');
  const localUri = `${FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? ''}${Date.now()}-${safeName}`;
  const downloadUrl = `${API_BASE_URL}/tasks/${taskId}/attachments/${attachment.id}/download`;
  const result = await FileSystem.downloadAsync(downloadUrl, localUri, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(result.uri, {
      mimeType: attachment.fileType ?? attachment.type ?? undefined,
      dialogTitle: fileName,
    });
    return;
  }

  await Linking.openURL(result.uri);
}

export function toUiStatus(status: ApiTaskStatus) {
  if (status === 'todo') return 'To Do';
  if (status === 'in_progress') return 'In Progress';
  if (status === 'done') return 'Done';
  return 'Missed';
}

export function toApiStatus(status: string): ApiTaskStatus {
  if (status === 'To Do') return 'todo';
  if (status === 'In Progress') return 'in_progress';
  if (status === 'Done') return 'done';
  return 'missed';
}

export function toUiPriority(priority: ApiTaskPriority) {
  if (priority === 'low') return 'Low';
  if (priority === 'high') return 'High';
  if (priority === 'urgent') return 'Urgent';
  return 'Medium';
}

export function toApiPriority(priority: string): ApiTaskPriority {
  if (priority === 'Low') return 'low';
  if (priority === 'High') return 'high';
  if (priority === 'Urgent') return 'urgent';
  return 'medium';
}

export function recurrenceToApi(recurrence: UiRecurrence | null | undefined): ApiRecurrence | null {
  if (!recurrence) return null;

  return {
    ...recurrence,
    endType:
      recurrence.endType === 'onDate'
        ? 'date'
        : recurrence.endType === 'after'
          ? 'occurrences'
          : 'never',
  };
}

export function recurrenceToUi(recurrence: ApiRecurrence | null | undefined): UiRecurrence | null {
  if (!recurrence) return null;

  return {
    ...recurrence,
    endType:
      recurrence.endType === 'date'
        ? 'onDate'
        : recurrence.endType === 'occurrences'
          ? 'after'
          : 'never',
    endDate: recurrence.endDate ?? '',
  };
}
