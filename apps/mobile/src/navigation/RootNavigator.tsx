import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import type { ComponentType } from 'react'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Text, View } from 'react-native'
import { NavigationBottomTabBar } from '../components/layout/BottomNavBar'
import { type MainTabParamList, MAIN_TAB_ROUTES, type RootStackParamList } from './types'

const Stack = createNativeStackNavigator<RootStackParamList>()
const Tabs = createBottomTabNavigator<MainTabParamList>()

function StageOneRoute({ label }: { label: string }) {
  return (
    <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center' }}>
      <Text>{label}</Text>
    </View>
  )
}

/**
 * Typed route definitions for the staged migration. App.tsx continues to own
 * screen rendering until Stage 2 moves the existing screens into these routes.
 */
type TabScreens = Partial<Record<keyof MainTabParamList, ComponentType>>

export function MainTabs({ screens }: { screens?: TabScreens }) {
  const routes: Record<keyof MainTabParamList, ComponentType> = {
    Dashboard: screens?.Dashboard ?? (() => <StageOneRoute label="Dashboard" />),
    Tasks: screens?.Tasks ?? (() => <StageOneRoute label="Tasks" />),
    Focus: screens?.Focus ?? (() => <StageOneRoute label="Focus" />),
    Reminders: screens?.Reminders ?? (() => <StageOneRoute label="Reminders" />),
    People: screens?.People ?? (() => <StageOneRoute label="People" />),
  }
  return (
    <Tabs.Navigator screenOptions={{ headerShown: false }} tabBar={(props) => <NavigationBottomTabBar {...props} />}>
      {MAIN_TAB_ROUTES.map((route) => <Tabs.Screen key={route} name={route} component={routes[route]} />)}
    </Tabs.Navigator>
  )
}

export function RootNavigator({ tabScreens, taskDetailsRoute: TaskDetailsRoute, createTaskRoute: CreateTaskRoute, editTaskRoute: EditTaskRoute, aiTaskBuilderRoute: AiTaskBuilderRoute, aiDailyPlannerRoute: AiDailyPlannerRoute, calendarRoute: CalendarRoute, notesRoute: NotesRoute, analyticsRoute: AnalyticsRoute, aiCollaborationRoute: AiCollaborationRoute, focusSessionRoute: FocusSessionRoute, reminderDetailsRoute: ReminderDetailsRoute, createReminderRoute: CreateReminderRoute, editReminderRoute: EditReminderRoute, notificationsRoute: NotificationsRoute }: { tabScreens?: TabScreens; taskDetailsRoute?: ComponentType<NativeStackScreenProps<RootStackParamList, 'TaskDetails'>>; createTaskRoute?: ComponentType<NativeStackScreenProps<RootStackParamList, 'CreateTask'>>; editTaskRoute?: ComponentType<NativeStackScreenProps<RootStackParamList, 'EditTask'>>; aiTaskBuilderRoute?: ComponentType<NativeStackScreenProps<RootStackParamList, 'AiTaskBuilder'>>; aiDailyPlannerRoute?: ComponentType<NativeStackScreenProps<RootStackParamList, 'AiDailyPlanner'>>; calendarRoute?: ComponentType<NativeStackScreenProps<RootStackParamList, 'Calendar'>>; notesRoute?: ComponentType<NativeStackScreenProps<RootStackParamList, 'Notes'>>; analyticsRoute?: ComponentType<NativeStackScreenProps<RootStackParamList, 'Analytics'>>; aiCollaborationRoute?: ComponentType<NativeStackScreenProps<RootStackParamList, 'AiCollaboration'>>; focusSessionRoute?: ComponentType<NativeStackScreenProps<RootStackParamList, 'FocusSession'>>; reminderDetailsRoute?: ComponentType<NativeStackScreenProps<RootStackParamList, 'ReminderDetails'>>; createReminderRoute?: ComponentType<NativeStackScreenProps<RootStackParamList, 'CreateReminder'>>; editReminderRoute?: ComponentType<NativeStackScreenProps<RootStackParamList, 'EditReminder'>>; notificationsRoute?: ComponentType<NativeStackScreenProps<RootStackParamList, 'Notifications'>> }) {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MainTabs">{() => <MainTabs screens={tabScreens} />}</Stack.Screen>
      {TaskDetailsRoute ? <Stack.Screen name="TaskDetails" component={TaskDetailsRoute} /> : null}
      {CreateTaskRoute ? <Stack.Screen name="CreateTask" component={CreateTaskRoute} /> : null}
      {EditTaskRoute ? <Stack.Screen name="EditTask" component={EditTaskRoute} /> : null}
      {AiTaskBuilderRoute ? <Stack.Screen name="AiTaskBuilder" component={AiTaskBuilderRoute} /> : null}
      {AiDailyPlannerRoute ? <Stack.Screen name="AiDailyPlanner" component={AiDailyPlannerRoute} /> : null}
      {CalendarRoute ? <Stack.Screen name="Calendar" component={CalendarRoute} /> : null}
      {NotesRoute ? <Stack.Screen name="Notes" component={NotesRoute} /> : null}
      {AnalyticsRoute ? <Stack.Screen name="Analytics" component={AnalyticsRoute} /> : null}
      {AiCollaborationRoute ? <Stack.Screen name="AiCollaboration" component={AiCollaborationRoute} /> : null}
      {FocusSessionRoute ? <Stack.Screen name="FocusSession" component={FocusSessionRoute} /> : null}
      {ReminderDetailsRoute ? <Stack.Screen name="ReminderDetails" component={ReminderDetailsRoute} /> : null}
      {CreateReminderRoute ? <Stack.Screen name="CreateReminder" component={CreateReminderRoute} /> : null}
      {EditReminderRoute ? <Stack.Screen name="EditReminder" component={EditReminderRoute} /> : null}
      {NotificationsRoute ? <Stack.Screen name="Notifications" component={NotificationsRoute} /> : null}
    </Stack.Navigator>
  )
}
