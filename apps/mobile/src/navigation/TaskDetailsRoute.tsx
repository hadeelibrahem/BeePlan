import { useEffect, useState } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import TaskDetailsScreen from '../screens/TaskDetailsScreen'
import { getTask, type ApiTask } from '../lib/tasksApi'
import { useTheme } from '../theme/useTheme'
import type { RootStackParamList } from './types'

type RouteProps = NativeStackScreenProps<RootStackParamList, 'TaskDetails'>
type Handlers = {
  currentUserId: string
  notice: string
  onNoticeShown: () => void
  onBack: () => void
  onEdit: () => void
  onDelete: () => Promise<void>
  onMarkDone: () => void
  onTaskUpdated: (task: ApiTask) => void
  onRefresh: () => void
}

/** Route-param task resolver. App.tsx supplies existing business handlers during the staged migration. */
export function TaskDetailsRoute({ route, navigation, accessToken, tasks, ...handlers }: RouteProps & Handlers & { accessToken: string; tasks: ApiTask[] }) {
  const { theme } = useTheme()
  const taskId = route.params.taskId
  const [task, setTask] = useState<ApiTask | null>(() => tasks.find((item) => item.id === taskId) ?? null)
  const [loading, setLoading] = useState(!task)
  const [error, setError] = useState('')

  useEffect(() => {
    const cached = tasks.find((item) => item.id === taskId)
    if (cached) { setTask(cached); setLoading(false); return }
    let active = true
    setLoading(true); setError('')
    void getTask(accessToken, taskId).then((loaded) => {
      if (active) setTask(loaded)
    }).catch(() => {
      if (active) setError('This task is no longer available.')
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [accessToken, taskId, tasks])

  if (loading) return <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center' }}><ActivityIndicator color={theme.colors.accent} /></View>
  if (!task || error) return <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24 }}><Text style={{ color: theme.colors.error }}>{error || 'Task not found.'}</Text></View>
  return <TaskDetailsScreen task={task} tasks={tasks} accessToken={accessToken} {...handlers} onOpenAiCollaboration={() => navigation.navigate('AiCollaboration', { taskId })} />
}
