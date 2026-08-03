export type NotificationPreferences = {
  id: string;
  userId: string;
  taskNotifications: boolean;
  calendarNotifications: boolean;
  focusNotifications: boolean;
  collaborationNotifications: boolean;
  aiNotifications: boolean;
  emailNotifications: boolean;
  pushNotifications: boolean;
  createdAt: Date;
  updatedAt: Date;
};
