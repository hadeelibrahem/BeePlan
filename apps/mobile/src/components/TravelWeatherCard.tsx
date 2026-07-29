import { useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { getTaskTravelWeatherPreview, type ApiTask } from '../lib/tasksApi'
import { useTheme } from '../theme/useTheme'
export function TravelWeatherCard({ token, task }: { token: string; task: ApiTask }) {
  const { theme: { colors } } = useTheme(); const [preview,setPreview] = useState<any>(null)
  const refresh = () => getTaskTravelWeatherPreview(token,task.id).then(setPreview)
  useEffect(() => { if (task.destination && task.scheduledDate) void refresh() }, [task.id,task.updatedAt])
  if (!task.destination || !task.scheduledDate || !task.scheduledStartTime) return null
  return <View className="mx-4 mb-3 rounded-2xl border p-4" style={{ borderColor: colors.border, backgroundColor: colors.card }}><View className="flex-row justify-between"><Text className="font-black" style={{ color: colors.text }}>Travel &amp; Weather</Text><Pressable accessibilityRole="button" onPress={() => void refresh()}><Text className="font-bold" style={{ color: colors.accent }}>Refresh</Text></Pressable></View>{preview?.eligibility?.eligible ? <View className="mt-2"><Text style={{ color: colors.secondaryText }}>Destination: {preview.destination.displayName}</Text><Text style={{ color: colors.secondaryText }}>Origin: {preview.origin.source.replaceAll('_',' ')}</Text><Text style={{ color: colors.secondaryText }}>Travel: {preview.route ? `${preview.route.fallbackUsed ? 'approximately ' : ''}${preview.route.durationMinutes} min` : 'unavailable'}</Text><Text style={{ color: colors.secondaryText }}>Departure: {preview.recommendedDepartureTime ? new Date(preview.recommendedDepartureTime).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}) : 'unavailable'}</Text><Text className="mt-2 font-bold" style={{ color: colors.text }}>{preview.deterministicMessage}</Text></View> : <Text className="mt-2" style={{ color: colors.secondaryText }}>{preview?.eligibility?.reason ?? 'Loading preview…'}</Text>}</View>
}
