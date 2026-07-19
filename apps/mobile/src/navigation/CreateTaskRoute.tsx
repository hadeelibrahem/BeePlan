import { useRef, useState } from 'react'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import CreateTaskScreen, { type CreateTaskLifecycleState } from '../screens/CreateTaskScreen'
import type { ApiTask, TaskPayload } from '../lib/tasksApi'
import type { RootStackParamList } from './types'

type Props = NativeStackScreenProps<RootStackParamList, 'CreateTask'> & {
  accessToken: string
  tasks?: ApiTask[]
  onSave: (payload: TaskPayload) => Promise<ApiTask | undefined> | ApiTask | void
}

/** Navigator lifecycle owner; the screen retains form, validation, and upload logic. */
export function CreateTaskRoute({ navigation, route, accessToken, tasks, onSave }: Props) {
  const [lifecycle, setLifecycle] = useState<CreateTaskLifecycleState>({ isDirty: false, isSubmitting: false, error: '' })
  const leavingRef = useRef(false)

  function cancel() {
    if (leavingRef.current || lifecycle.isSubmitting) return
    leavingRef.current = true
    navigation.goBack()
  }

  return (
    <CreateTaskScreen
      accessToken={accessToken}
      tasks={tasks}
      initialDueDate={route.params?.initialDueDate}
      onLifecycleChange={setLifecycle}
      onCancel={cancel}
      onSave={onSave}
      onCreated={(task) => {
        if (lifecycle.error) return
        navigation.replace('TaskDetails', { taskId: task.id })
      }}
    />
  )
}
