import AsyncStorage from '@react-native-async-storage/async-storage'
import cancelScheduledNotificationAsync from 'expo-notifications/build/cancelScheduledNotificationAsync'
import scheduleNotificationAsync from 'expo-notifications/build/scheduleNotificationAsync'
import { getPermissionsAsync } from 'expo-notifications/build/NotificationPermissions'
import { SchedulableTriggerInputTypes } from 'expo-notifications/build/Notifications.types'
import { acknowledgeWeatherTravelNotification, getUpcomingWeatherTravelNotifications } from './tasksApi'

const KEY = 'beeplan:weather-travel-local-notifications'
export async function syncWeatherTravelNotifications(accessToken: string) {
  const permission = await getPermissionsAsync(); if (!permission.granted) return
  const pending = await getUpcomingWeatherTravelNotifications(accessToken)
  const previous = JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}') as Record<string,string>
  const next: Record<string,string> = {}
  for (const record of pending) {
    // Task Assistant contextual events are backend-owned. Local scheduling is
    // disabled unless the server explicitly opts a legacy record into the
    // fallback channel; this prevents a backend push and local alert racing.
    if (!(record.payload as { localDeliveryEligible?: boolean } | undefined)?.localDeliveryEligible)
      continue
    const trigger = new Date(record.notificationTime); if (trigger.getTime() <= Date.now()) continue
    const existing = previous[record.id]
    if (existing) { next[record.id] = existing; continue }
    const localId = await scheduleNotificationAsync({ content: { title: 'Weather & travel', body: record.polishedMessage ?? record.deterministicMessage, sound: 'default', data: { weatherTravelNotificationId: record.id } }, trigger: { type: SchedulableTriggerInputTypes.DATE, date: trigger } })
    next[record.id] = localId
  }
  for (const [recordId, localId] of Object.entries(previous)) if (!next[recordId]) await cancelScheduledNotificationAsync(localId).catch(() => undefined)
  await AsyncStorage.setItem(KEY, JSON.stringify(next))
}
export async function acknowledgeWeatherTravelDelivery(accessToken: string, id: string) { await acknowledgeWeatherTravelNotification(accessToken,id); const previous = JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}'); delete previous[id]; await AsyncStorage.setItem(KEY,JSON.stringify(previous)) }
