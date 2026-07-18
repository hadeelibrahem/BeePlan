import type { NavigatorScreenParams } from '@react-navigation/native'

export const MAIN_TAB_ROUTES = ['Dashboard', 'Tasks', 'Focus', 'Reminders', 'People'] as const

export type MainTabParamList = {
  Dashboard: undefined
  Tasks: undefined
  Focus: undefined
  Reminders: undefined
  People: undefined
}

export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<MainTabParamList> | undefined
  TaskDetails: { taskId: string }
  CreateTask: { source?: 'dashboard' | 'tasks' }
  EditTask: { taskId: string }
  AiTaskBuilder: { source?: 'dashboard' | 'tasks' }
  AiCollaboration: { taskId: string }
  Notifications: undefined
  ReminderDetails: { reminderId: string }
  CreateReminder: { initialType?: 'task' | 'person' | 'checklist' }
  EditReminder: { reminderId: string }
  Auth: undefined
  ForgotPassword: undefined
  ResetPassword: { email?: string; code?: string }
}
