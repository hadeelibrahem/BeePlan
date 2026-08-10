import { createContext, useContext, type ReactNode } from 'react'
import type { ApiTask } from '../../lib/tasksApi'
import type { WhiteboardTaskCard } from './api/whiteboardApi'

export type WhiteboardTaskContextValue = {
  tasks: ApiTask[]
  loading: boolean
  taskCards: Record<string, WhiteboardTaskCard>
  taskCardsLoading: boolean
  onCompleteTask: (task: ApiTask) => Promise<void>
  onOpenTask: (taskId: string) => void
  onStartFocus: (task: ApiTask) => Promise<void>
  onRemoveShape: (shapeId: string) => void
  busyTaskId: string | null
}

const WhiteboardTaskContext = createContext<WhiteboardTaskContextValue | null>(null)

export function WhiteboardTaskProvider({ value, children }: { value: WhiteboardTaskContextValue; children: ReactNode }) {
  return <WhiteboardTaskContext.Provider value={value}>{children}</WhiteboardTaskContext.Provider>
}

export function useWhiteboardTaskContext() {
  return useContext(WhiteboardTaskContext)
}
