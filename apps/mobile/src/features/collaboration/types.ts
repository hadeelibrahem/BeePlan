export type TaskRole = 'owner' | 'editor' | 'viewer';
export type MemberStatus = 'accepted' | 'pending' | 'declined';

export type MemberUser = {
  id: string;
  fullName: string;
  email: string;
  avatarUrl?: string;
};

export type TaskMember = {
  id: string | null;
  userId: string;
  role: TaskRole;
  status: MemberStatus;
  isOwner: boolean;
  invitedAt?: string;
  acceptedAt?: string;
  joinedAt?: string;
  user: MemberUser;
};

export type TaskComment = {
  id: string;
  taskId: string;
  message: string;
  author?: { id: string; fullName: string; avatarUrl?: string };
  mentionedUserIds: string[];
  isEdited: boolean;
  editedAt?: string;
  createdAt: string;
};

export type CommentsPage = {
  items: TaskComment[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
};

export type TaskInvitation = {
  id: string;
  taskId: string;
  taskTitle: string;
  role: TaskRole;
  invitedAt: string;
  invitedBy: { id: string; fullName: string; email: string; avatarUrl?: string } | null;
};

export type PersonalPreferences = {
  taskId: string;
  isPinned: boolean;
  isFavorite: boolean;
  isFocusQueued: boolean;
  personalReminderMinutesBefore?: number;
  notificationsMuted: boolean;
};

export type TaskReminder = {
  id: string;
  taskId?: string;
  audience: 'shared' | 'personal';
  title: string;
  triggerDateTime?: string;
  reminderBeforeMinutes?: number;
  notes?: string;
  createdBy?: string;
  createdAt: string;
};

export type NotificationType =
  | 'reminder'
  | 'task_invite'
  | 'invite_accepted'
  | 'invite_declined'
  | 'member_joined'
  | 'member_removed'
  | 'member_role_changed'
  | 'ownership_transferred'
  | 'task_updated'
  | 'task_completed'
  | 'due_date_changed'
  | 'priority_changed'
  | 'reminder_updated'
  | 'subtask_completed'
  | 'attachment_added'
  | 'comment_added'
  | 'mention';

export type AppNotification = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  taskId?: string;
  data?: Record<string, unknown>;
  isRead: boolean;
  actor?: { id: string; fullName: string; avatarUrl?: string };
  sentAt: string;
};

export type NotificationsPage = {
  items: AppNotification[];
  page: number;
  pageSize: number;
  hasMore: boolean;
};

export const ROLE_META: Record<TaskRole, { icon: string; label: string }> = {
  owner: { icon: '👑', label: 'Owner' },
  editor: { icon: '✏️', label: 'Editor' },
  viewer: { icon: '👁', label: 'Viewer' },
};

export const NOTIFICATION_ICON: Record<NotificationType, string> = {
  reminder: '⏰',
  task_invite: '✉️',
  invite_accepted: '🤝',
  invite_declined: '🙅',
  member_joined: '🎉',
  member_removed: '🚪',
  member_role_changed: '🎭',
  ownership_transferred: '👑',
  task_updated: '📝',
  task_completed: '✅',
  due_date_changed: '📅',
  priority_changed: '⚡',
  reminder_updated: '🔔',
  subtask_completed: '☑️',
  attachment_added: '📎',
  comment_added: '💬',
  mention: '📣',
};
