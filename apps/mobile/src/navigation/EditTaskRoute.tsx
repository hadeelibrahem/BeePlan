import { Component, type ErrorInfo, type ReactNode, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import EditTaskScreen, { type EditTaskLifecycleState } from '../screens/EditTaskScreen'
import { getTask, type ApiTask, type TaskPayload } from '../lib/tasksApi'
import { useTheme } from '../theme/useTheme'
import type { RootStackParamList } from './types'
import { normalizeEditTask } from './editTaskData'

type Props = NativeStackScreenProps<RootStackParamList, 'EditTask'> & {
  accessToken: string; tasks: ApiTask[]; currentUserId: string
  onBack: () => void; onCancel: () => void; onRefresh: () => void; onDelete: () => Promise<void>; onSave: (payload: TaskPayload) => Promise<ApiTask | undefined> | ApiTask | void
  onSaved: (task: ApiTask) => void; onSubtasksUpdated: (task: ApiTask) => void; onDependenciesUpdated: (task: ApiTask) => void; onPermissionDenied: () => void
}

function editTaskDiagnostic(event: string, detail?: Record<string, boolean>) {
  if (__DEV__) console.debug(`[edit_task] ${event}`, detail)
}

class EditTaskRenderBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    editTaskDiagnostic('edit_task_render_error')
  }

  render() {
    return this.state.failed ? <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24 }}><Text>Unable to open Edit Task. Please go back and try again.</Text></View> : this.props.children
  }
}

/** Detail-resolving route; save/delete/navigation lifecycle remains in App for this stage. */
export function EditTaskRoute({ route, navigation, accessToken, tasks, currentUserId, onSave, onSaved, onDelete, ...handlers }: Props) {
  const { theme } = useTheme(); const taskId = route.params.taskId
  const cachedTask = tasks.find((item) => item.id === taskId)
  const [task, setTask] = useState<ApiTask | null>(null)
  const [loading, setLoading] = useState(true); const [error, setError] = useState('')
  const [lifecycle, setLifecycle] = useState<EditTaskLifecycleState>({ isDirty: false, isSubmitting: false, error: '' })
  const leavingRef = useRef(false)
  useEffect(() => {
    let active = true; setLoading(true); setError('')
    editTaskDiagnostic('edit_task_load_started')
    void getTask(accessToken, taskId).then((loaded) => {
      if (active) { setTask(normalizeEditTask(loaded)); editTaskDiagnostic('edit_task_load_success') }
    }).catch(() => {
      if (!active) return
      editTaskDiagnostic('edit_task_load_failed', { has_cached_task: Boolean(cachedTask) })
      if (cachedTask) setTask(normalizeEditTask(cachedTask))
      else setError('This task is no longer available.')
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [accessToken, taskId, cachedTask])
  useEffect(() => { if (__DEV__) console.debug('[edit_task] edit_task_screen_mounted') }, [])
  if (loading) return <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center' }}><ActivityIndicator color={theme.colors.accent} /></View>
  if (!task || error) return <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24 }}><Text style={{ color: theme.colors.error }}>{error || 'Task not found.'}</Text></View>
  const leave = () => {
    if (leavingRef.current || lifecycle.isSubmitting) return
    leavingRef.current = true
    if (navigation.canGoBack()) navigation.goBack()
    else navigation.reset({ index: 0, routes: [{ name: 'MainTabs', params: { screen: 'Tasks' } }] })
  }
  return <EditTaskRenderBoundary><EditTaskScreen task={task} tasks={tasks} accessToken={accessToken} currentUserId={currentUserId} {...handlers}
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
    onLifecycleChange={setLifecycle} /></EditTaskRenderBoundary>
}
