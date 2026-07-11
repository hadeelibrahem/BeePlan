import type {
  CommentsPage,
  NotificationsPage,
  PersonalPreferences,
  TaskComment,
  TaskInvitation,
  TaskMember,
  TaskReminder,
  TaskRole,
} from '../types'

const apiUrl = (import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3000').replace(/\/+$/, '')

/**
 * Thin fetch wrapper mirroring features/social. Backend validation messages are
 * surfaced as `Error.message`; callers map them to friendly copy. A dedicated
 * `code` is attached when the backend returns a known conflict so the UI can
 * branch (e.g. "already a member").
 */
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

  if (response.status === 204) return undefined as T

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const message = Array.isArray(data?.message) ? data.message.join(', ') : data?.message
    const error = new Error(message ?? 'request_failed') as Error & { status?: number }
    error.status = response.status
    throw error
  }
  return data as T
}

// --- Members / invitations -------------------------------------------------

export function getMembers(taskId: string, accessToken: string) {
  return request<TaskMember[]>(`/tasks/${taskId}/members`, accessToken)
}

export function inviteMember(
  taskId: string,
  userId: string,
  role: 'editor' | 'viewer',
  accessToken: string,
) {
  return request<TaskMember>(`/tasks/${taskId}/invite`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ userId, role }),
  })
}

export function acceptInvite(taskId: string, accessToken: string) {
  return request<TaskMember>(`/tasks/${taskId}/accept`, accessToken, { method: 'POST' })
}

export function declineInvite(taskId: string, accessToken: string) {
  return request<TaskMember>(`/tasks/${taskId}/decline`, accessToken, { method: 'POST' })
}

export function updateMemberRole(
  taskId: string,
  userId: string,
  role: 'editor' | 'viewer',
  accessToken: string,
) {
  return request<TaskMember>(`/tasks/${taskId}/member-role`, accessToken, {
    method: 'PATCH',
    body: JSON.stringify({ userId, role }),
  })
}

export function removeMember(taskId: string, userId: string, accessToken: string) {
  return request<{ success: boolean }>(`/tasks/${taskId}/member`, accessToken, {
    method: 'DELETE',
    body: JSON.stringify({ userId }),
  })
}

export function transferOwnership(taskId: string, userId: string, accessToken: string) {
  return request<{ success: boolean }>(`/tasks/${taskId}/transfer-ownership`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  })
}

export function getMyInvitations(accessToken: string) {
  return request<TaskInvitation[]>('/invitations', accessToken)
}

// --- Comments --------------------------------------------------------------

export function getComments(taskId: string, accessToken: string, page = 1, pageSize = 20) {
  return request<CommentsPage>(
    `/tasks/${taskId}/comments?page=${page}&pageSize=${pageSize}`,
    accessToken,
  )
}

export function createComment(
  taskId: string,
  message: string,
  mentionedUserIds: string[],
  accessToken: string,
) {
  return request<TaskComment>(`/tasks/${taskId}/comments`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ message, mentionedUserIds }),
  })
}

export function updateComment(
  commentId: string,
  message: string,
  mentionedUserIds: string[],
  accessToken: string,
) {
  return request<TaskComment>(`/comments/${commentId}`, accessToken, {
    method: 'PATCH',
    body: JSON.stringify({ message, mentionedUserIds }),
  })
}

export function deleteComment(commentId: string, accessToken: string) {
  return request<{ success: boolean }>(`/comments/${commentId}`, accessToken, {
    method: 'DELETE',
  })
}

// --- Personal preferences --------------------------------------------------

export function getPreferences(taskId: string, accessToken: string) {
  return request<PersonalPreferences>(`/tasks/${taskId}/preferences`, accessToken)
}

export function updatePreferences(
  taskId: string,
  patch: Partial<Omit<PersonalPreferences, 'taskId'>>,
  accessToken: string,
) {
  return request<PersonalPreferences>(`/tasks/${taskId}/preferences`, accessToken, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

// --- Task reminders (shared / personal) ------------------------------------

export type TaskReminderInput = {
  title?: string
  triggerDateTime?: string
  reminderBeforeMinutes?: number
  notes?: string
}

export function getTaskReminders(taskId: string, accessToken: string) {
  return request<TaskReminder[]>(`/tasks/${taskId}/reminders`, accessToken)
}

export function createSharedReminder(taskId: string, input: TaskReminderInput, accessToken: string) {
  return request<TaskReminder>(`/tasks/${taskId}/shared-reminder`, accessToken, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function createPersonalReminder(
  taskId: string,
  input: TaskReminderInput,
  accessToken: string,
) {
  return request<TaskReminder>(`/tasks/${taskId}/personal-reminder`, accessToken, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

// --- Notifications ---------------------------------------------------------

export function getNotifications(accessToken: string, page = 1, pageSize = 20, unreadOnly = false) {
  const query = `?page=${page}&pageSize=${pageSize}${unreadOnly ? '&unreadOnly=true' : ''}`
  return request<NotificationsPage>(`/notifications${query}`, accessToken)
}

export function getUnreadCount(accessToken: string) {
  return request<{ count: number }>('/notifications/unread-count', accessToken)
}

export function markNotificationRead(id: string, accessToken: string) {
  return request<{ success: boolean }>(`/notifications/${id}/read`, accessToken, { method: 'PATCH' })
}

export function markAllNotificationsRead(accessToken: string) {
  return request<{ success: boolean }>('/notifications/read-all', accessToken, { method: 'POST' })
}

export const ROLE_META: Record<TaskRole, { icon: string; label: string }> = {
  owner: { icon: '👑', label: 'Owner' },
  editor: { icon: '✏️', label: 'Editor' },
  viewer: { icon: '👁', label: 'Viewer' },
}
