import { API_BASE_URL, apiFetch, readJsonOrThrow } from '../../../lib/apiClient';
import { getAuthToken } from '../../../lib/authToken';
import type {
  CommentsPage,
  NotificationsPage,
  PersonalPreferences,
  TaskComment,
  TaskInvitation,
  TaskMember,
  TaskReminder,
} from '../types';

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

// --- Members / invitations -------------------------------------------------

export function getMembers(taskId: string) {
  return apiRequest<TaskMember[]>(`/tasks/${taskId}/members`);
}

export function inviteMember(taskId: string, userId: string, role: 'editor' | 'viewer') {
  return apiRequest<TaskMember>(`/tasks/${taskId}/invite`, {
    method: 'POST',
    body: JSON.stringify({ userId, role }),
  });
}

export function acceptInvite(taskId: string) {
  return apiRequest<TaskMember>(`/tasks/${taskId}/accept`, { method: 'POST' });
}

export function declineInvite(taskId: string) {
  return apiRequest<TaskMember>(`/tasks/${taskId}/decline`, { method: 'POST' });
}

export function updateMemberRole(taskId: string, userId: string, role: 'editor' | 'viewer') {
  return apiRequest<TaskMember>(`/tasks/${taskId}/member-role`, {
    method: 'PATCH',
    body: JSON.stringify({ userId, role }),
  });
}

export function removeMember(taskId: string, userId: string) {
  return apiRequest<{ success: boolean }>(`/tasks/${taskId}/member`, {
    method: 'DELETE',
    body: JSON.stringify({ userId }),
  });
}

export function transferOwnership(taskId: string, userId: string) {
  return apiRequest<{ success: boolean }>(`/tasks/${taskId}/transfer-ownership`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

export function getMyInvitations() {
  return apiRequest<TaskInvitation[]>('/invitations');
}

// --- Comments --------------------------------------------------------------

export function getComments(taskId: string, page = 1, pageSize = 20) {
  return apiRequest<CommentsPage>(`/tasks/${taskId}/comments?page=${page}&pageSize=${pageSize}`);
}

export function createComment(taskId: string, message: string, mentionedUserIds: string[]) {
  return apiRequest<TaskComment>(`/tasks/${taskId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ message, mentionedUserIds }),
  });
}

export function updateComment(commentId: string, message: string, mentionedUserIds: string[]) {
  return apiRequest<TaskComment>(`/comments/${commentId}`, {
    method: 'PATCH',
    body: JSON.stringify({ message, mentionedUserIds }),
  });
}

export function deleteComment(commentId: string) {
  return apiRequest<{ success: boolean }>(`/comments/${commentId}`, { method: 'DELETE' });
}

// --- Personal preferences --------------------------------------------------

export function getPreferences(taskId: string) {
  return apiRequest<PersonalPreferences>(`/tasks/${taskId}/preferences`);
}

export function updatePreferences(
  taskId: string,
  patch: Partial<Omit<PersonalPreferences, 'taskId'>>,
) {
  return apiRequest<PersonalPreferences>(`/tasks/${taskId}/preferences`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

// --- Task reminders --------------------------------------------------------

export type TaskReminderInput = {
  title?: string;
  triggerDateTime?: string;
  reminderBeforeMinutes?: number;
  notes?: string;
};

export function getTaskReminders(taskId: string) {
  return apiRequest<TaskReminder[]>(`/tasks/${taskId}/reminders`);
}

export function createSharedReminder(taskId: string, input: TaskReminderInput) {
  return apiRequest<TaskReminder>(`/tasks/${taskId}/shared-reminder`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function createPersonalReminder(taskId: string, input: TaskReminderInput) {
  return apiRequest<TaskReminder>(`/tasks/${taskId}/personal-reminder`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

// --- Notifications ---------------------------------------------------------

export function getNotifications(page = 1, pageSize = 20, unreadOnly = false) {
  const query = `?page=${page}&pageSize=${pageSize}${unreadOnly ? '&unreadOnly=true' : ''}`;
  return apiRequest<NotificationsPage>(`/notifications${query}`);
}

export function getUnreadCount() {
  return apiRequest<{ count: number }>('/notifications/unread-count');
}

export function markNotificationRead(id: string) {
  return apiRequest<{ success: boolean }>(`/notifications/${id}/read`, { method: 'PATCH' });
}

export function markAllNotificationsRead() {
  return apiRequest<{ success: boolean }>('/notifications/read-all', { method: 'POST' });
}
