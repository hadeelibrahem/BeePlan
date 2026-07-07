const apiUrl = (import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3000').replace(/\/+$/, '')

export type TaskPlanChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

export type TaskPlanPriority = 'low' | 'medium' | 'high'

export type ConversationState = 'discovery' | 'scope_refinement' | 'planning' | 'review' | 'save_ready'

export type UnderstoodSummary = {
  goal: string
  goalType: string | null
  deadline: string | null
  availableTime: string | null
  currentProgress: string | null
  deliverables: string[]
  constraints: string[]
  risks: string[]
}

export type TaskPlanMainTask = {
  title: string
  description: string
  dueDate: string | null
  priority: TaskPlanPriority
}

export type TaskPlanSubtask = {
  title: string
  description: string
  estimatedMinutes: number
  order: number
}

export type TaskPlanFocusSession = {
  title: string
  startTime: string
  endTime: string
  relatedSubtaskTitle: string
}

export type TaskPlanReminder = {
  title: string
  remindAt: string
  type: 'time'
}

export type TaskPlan = {
  mainTask: TaskPlanMainTask
  subtasks: TaskPlanSubtask[]
  focusSessions: TaskPlanFocusSession[]
  reminders: TaskPlanReminder[]
}

export type TaskPlanChatResponse = {
  type: 'question' | 'advice' | 'plan'
  message: string
  quickReplies?: string[]
  state: ConversationState
  understoodSummary?: UnderstoodSummary
  plan?: TaskPlan
}

export async function sendTaskPlanChat(
  accessToken: string,
  messages: TaskPlanChatMessage[],
  availability?: Record<string, unknown>,
): Promise<TaskPlanChatResponse> {
  let response: Response
  try {
    response = await fetch(`${apiUrl}/ai/task-plan/chat`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages, ...(availability ? { availability } : {}) }),
    })
  } catch {
    throw new Error(`Unable to reach BeePlan API at ${apiUrl}.`)
  }

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    const message = Array.isArray(data?.message) ? data.message.join(', ') : data?.message
    throw new Error(message ?? 'AI planning request failed. Please try again.')
  }

  return data as TaskPlanChatResponse
}
