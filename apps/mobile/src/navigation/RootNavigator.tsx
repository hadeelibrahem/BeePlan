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
  const Dashboard = screens?.Dashboard ?? (() => <StageOneRoute label="Dashboard" />)
  const Tasks = screens?.Tasks ?? (() => <StageOneRoute label="Tasks" />)
  const Focus = screens?.Focus ?? (() => <StageOneRoute label="Focus" />)
  const Reminders = screens?.Reminders ?? (() => <StageOneRoute label="Reminders" />)
  const People = screens?.People ?? (() => <StageOneRoute label="People" />)
  return (
    <Tabs.Navigator screenOptions={{ headerShown: false }} tabBar={(props) => <NavigationBottomTabBar {...props} />}>
      <Tabs.Screen name="Dashboard" component={Dashboard} />
      <Tabs.Screen name="Tasks" component={Tasks} />
      <Tabs.Screen name="Focus" component={Focus} />
      <Tabs.Screen name="Reminders" component={Reminders} />
      <Tabs.Screen name="People" component={People} />
    </Tabs.Navigator>
  )
}

export function RootNavigator({ tabScreens, taskDetailsRoute: TaskDetailsRoute, createTaskRoute: CreateTaskRoute, editTaskRoute: EditTaskRoute, aiCollaborationRoute: AiCollaborationRoute, notificationsRoute: NotificationsRoute }: { tabScreens?: TabScreens; taskDetailsRoute?: ComponentType<NativeStackScreenProps<RootStackParamList, 'TaskDetails'>>; createTaskRoute?: ComponentType<NativeStackScreenProps<RootStackParamList, 'CreateTask'>>; editTaskRoute?: ComponentType<NativeStackScreenProps<RootStackParamList, 'EditTask'>>; aiCollaborationRoute?: ComponentType<NativeStackScreenProps<RootStackParamList, 'AiCollaboration'>>; notificationsRoute?: ComponentType<NativeStackScreenProps<RootStackParamList, 'Notifications'>> }) {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MainTabs">{() => <MainTabs screens={tabScreens} />}</Stack.Screen>
      {TaskDetailsRoute ? <Stack.Screen name="TaskDetails" component={TaskDetailsRoute} /> : null}
      {CreateTaskRoute ? <Stack.Screen name="CreateTask" component={CreateTaskRoute} /> : null}
      {EditTaskRoute ? <Stack.Screen name="EditTask" component={EditTaskRoute} /> : null}
      {AiCollaborationRoute ? <Stack.Screen name="AiCollaboration" component={AiCollaborationRoute} /> : null}
      {NotificationsRoute ? <Stack.Screen name="Notifications" component={NotificationsRoute} /> : null}
    </Stack.Navigator>
  )
}
