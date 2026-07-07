import { API_BASE_URL, apiFetch, readJsonOrThrow } from './apiClient';

export type TaskPlanChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type TaskPlanPriority = 'low' | 'medium' | 'high';

export type ConversationState = 'discovery' | 'scope_refinement' | 'planning' | 'review' | 'save_ready';

export type UnderstoodSummary = {
  goal: string;
  goalType: string | null;
  deadline: string | null;
  availableTime: string | null;
  currentProgress: string | null;
  deliverables: string[];
  constraints: string[];
  risks: string[];
};

export type TaskPlanMainTask = {
  title: string;
  description: string;
  dueDate: string | null;
  priority: TaskPlanPriority;
};

export type TaskPlanSubtask = {
  title: string;
  description: string;
  estimatedMinutes: number;
  order: number;
};

export type TaskPlanFocusSession = {
  title: string;
  startTime: string;
  endTime: string;
  relatedSubtaskTitle: string;
};

export type TaskPlanReminder = {
  title: string;
  remindAt: string;
  type: 'time';
};

export type TaskPlan = {
  mainTask: TaskPlanMainTask;
  subtasks: TaskPlanSubtask[];
  focusSessions: TaskPlanFocusSession[];
  reminders: TaskPlanReminder[];
};

export type TaskPlanChatResponse = {
  type: 'question' | 'advice' | 'plan';
  message: string;
  quickReplies?: string[];
  state: ConversationState;
  understoodSummary?: UnderstoodSummary;
  plan?: TaskPlan;
};

// The AI task-plan conversation grows every turn (full history + the user's
// open tasks are re-sent each time), so later turns take noticeably longer
// for the provider to answer than the first one. This endpoint alone gets a
// longer client-side timeout than the shared default (see apiClient.ts) so a
// slow-but-healthy later turn doesn't get aborted while everything else
// (health/login/tasks) keeps using the normal, much shorter timeout.
const TASK_PLAN_CHAT_TIMEOUT_MS = 60_000;

export async function sendTaskPlanChat(
  accessToken: string,
  messages: TaskPlanChatMessage[],
  availability?: Record<string, unknown>,
): Promise<TaskPlanChatResponse> {
  const path = '/ai/task-plan/chat';
  const response = await apiFetch(
    path,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages, ...(availability ? { availability } : {}) }),
    },
    TASK_PLAN_CHAT_TIMEOUT_MS,
  );

  return readJsonOrThrow<TaskPlanChatResponse>(response, `${API_BASE_URL}${path}`);
}
