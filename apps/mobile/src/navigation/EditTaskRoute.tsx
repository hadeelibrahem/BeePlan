import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import EditTaskScreen, { type EditTaskLifecycleState } from '../screens/EditTaskScreen'
import { getTask, type ApiTask, type TaskPayload } from '../lib/tasksApi'
import { useTheme } from '../theme/useTheme'
import type { RootStackParamList } from './types'

type Props = NativeStackScreenProps<RootStackParamList, 'EditTask'> & {
  accessToken: string; tasks: ApiTask[]; currentUserId: string
  onBack: () => void; onCancel: () => void; onRefresh: () => void; onDelete: () => Promise<void>; onSave: (payload: TaskPayload) => Promise<ApiTask | undefined> | ApiTask | void
  onSaved: (task: ApiTask) => void; onSubtasksUpdated: (task: ApiTask) => void; onDependenciesUpdated: (task: ApiTask) => void; onPermissionDenied: () => void
}

/** Cache-first route resolver; save/delete/navigation lifecycle remains in App for this stage. */
export function EditTaskRoute({ route, navigation, accessToken, tasks, currentUserId, onSave, onSaved, onDelete, ...handlers }: Props) {
  const { theme } = useTheme(); const taskId = route.params.taskId
  const [task, setTask] = useState<ApiTask | null>(() => tasks.find((item) => item.id === taskId) ?? null)
  const [loading, setLoading] = useState(!task); const [error, setError] = useState('')
  const [lifecycle, setLifecycle] = useState<EditTaskLifecycleState>({ isDirty: false, isSubmitting: false, error: '' })
  const leavingRef = useRef(false)
  useEffect(() => {
    const cached = tasks.find((item) => item.id === taskId)
    if (cached) { setTask(cached); setLoading(false); return }
    let active = true; setLoading(true); setError('')
    void getTask(accessToken, taskId).then((loaded) => { if (active) setTask(loaded) }).catch(() => { if (active) setError('This task is no longer available.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [accessToken, taskId, tasks])
  if (loading) return <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center' }}><ActivityIndicator color={theme.colors.accent} /></View>
  if (!task || error) return <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24 }}><Text style={{ color: theme.colors.error }}>{error || 'Task not found.'}</Text></View>
  const leave = () => {
    if (leavingRef.current || lifecycle.isSubmitting) return
    leavingRef.current = true
    if (navigation.canGoBack()) navigation.goBack()
    else navigation.reset({ index: 0, routes: [{ name: 'MainTabs', params: { screen: 'Tasks' } }] })
  }
  return <EditTaskScreen task={task} tasks={tasks} accessToken={accessToken} currentUserId={currentUserId} {...handlers}
    onBack={leave} onCancel={leave}
    onDelete={async () => {
      await onDelete()
      navigation.reset({ index: 0, routes: [{ name: 'MainTabs', params: { screen: 'Tasks' } }] })
    }}
    onOpenAiCollaboration={() => navigation.navigate('AiCollaboration', { taskId })}
    onSave={onSave}
    onSaved={(updatedTask) => {
      onSaved(updatedTask)
      navigation.replace('TaskDetails', { taskId: updatedTask.id })
    }}
    onSubtasksUpdated={handlers.onSubtasksUpdated}
    onDependenciesUpdated={handlers.onDependenciesUpdated}
    onLifecycleChange={setLifecycle} />
}
