import { useEffect, useState } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import AiCollaborationScreen from '../screens/AiCollaborationScreen'
import { getTask, type ApiTask } from '../lib/tasksApi'
import { useTheme } from '../theme/useTheme'
import type { RootStackParamList } from './types'

type Props = NativeStackScreenProps<RootStackParamList, 'AiCollaboration'> & { accessToken: string; tasks: ApiTask[]; onBack: () => void }

/** Cache-first task resolver; AI planning and apply lifecycle remain in AiCollaborationScreen. */
export function AiCollaborationRoute({ route, accessToken, tasks, onBack }: Props) {
  const { theme } = useTheme(); const taskId = route.params.taskId
  const [task, setTask] = useState<ApiTask | null>(() => tasks.find((item) => item.id === taskId) ?? null)
  const [loading, setLoading] = useState(!task); const [error, setError] = useState('')
  useEffect(() => {
    const cached = tasks.find((item) => item.id === taskId)
    if (cached) { setTask(cached); setLoading(false); return }
    let active = true; setLoading(true); setError('')
    void getTask(accessToken, taskId).then((loaded) => { if (active) setTask(loaded) }).catch(() => { if (active) setError('This task is no longer available.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [accessToken, taskId, tasks])
  if (loading) return <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center' }}><ActivityIndicator color={theme.colors.accent} /></View>
  if (!task || error) return <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24 }}><Text style={{ color: theme.colors.error }}>{error || 'Task not found.'}</Text></View>
  return <AiCollaborationScreen task={task} accessToken={accessToken} onBack={onBack} />
}
