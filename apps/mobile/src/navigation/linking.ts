import type { LinkingOptions } from '@react-navigation/native'
import type { RootStackParamList } from './types'

export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['beeplan://', 'https://beeplan.app'],
  config: {
    screens: {
      MainTabs: { screens: { Dashboard: 'dashboard', Tasks: 'tasks', Focus: 'focus', Reminders: 'reminders', People: 'people' } },
      TaskDetails: 'tasks/:taskId',
      EditTask: 'tasks/:taskId/edit',
      AiCollaboration: 'tasks/:taskId/collaboration',
      Notifications: 'notifications',
      ReminderDetails: 'reminders/:reminderId',
      CreateReminder: 'reminders/new',
      EditReminder: 'reminders/:reminderId/edit',
      ResetPassword: 'reset-password',
    },
  },
}
