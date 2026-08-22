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
  TaskDetails: { taskId: string; commentId?: string; subtaskId?: string }
  CreateTask: { source?: 'dashboard' | 'tasks' | 'calendar'; initialDueDate?: string }
  EditTask: { taskId: string }
  AiTaskBuilder: { source?: 'dashboard' | 'tasks' }
  AiDailyPlanner: undefined
  Calendar: undefined
  Notes: undefined
  Analytics: undefined
  AchievementMuseum: { taskId?: string; title?: string; achievementDate?: string; achievementId?: string } | undefined
  YearInReview: { year: number }
  RandomStart: undefined
  Whiteboards: undefined
  Whiteboard: { boardId: string }
  WhiteboardShare: { boardId: string }
  FocusSession: undefined
  FocusRooms: { roomId?: string } | undefined
  AiCollaboration: { taskId: string }
  Notifications: undefined
  Settings: undefined
  TimeCapsules: undefined
  Feedback: undefined
  FeedbackDetail: { feedbackId: string }
  Challenges: undefined
  ChallengeDetail: { challengeId: string }
  Supervision: undefined
  ReminderDetails: { reminderId: string }
  CreateReminder: { initialType?: 'task' | 'person' | 'checklist'; initialFriendId?: string }
  EditReminder: { reminderId: string }
  Auth: undefined
  ForgotPassword: undefined
  ResetPassword: { email?: string; code?: string }
}
