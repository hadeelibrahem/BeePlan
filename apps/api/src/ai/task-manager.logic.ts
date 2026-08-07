export type TaskManagerSeverity = 'info' | 'recommendation' | 'warning' | 'critical';

export type TaskManagerCandidate = {
  type: string;
  subtaskId?: string | null;
  recipientUserId: string;
  severity: TaskManagerSeverity;
  title: string;
  summary: string;
  explanation: string;
  evidence: Record<string, unknown>[];
  confidence: number;
  action: { label: string; kind: string; route: string };
  fingerprint: string;
  expiresAt?: Date;
};

export function taskManagerCandidates(input: {
  task: { id: string; title: string; userId: string; status: string; dueDate: Date | null; updatedAt: Date };
  subtasks: Array<{ id: string; title: string; status: string; assigneeUserId: string | null; estimatedDurationMinutes: number | null; dueDate: Date | null; updatedAt: Date }>;
  dependencies: Array<{ subtaskId: string; dependsOnSubtaskId: string; completed?: boolean }>;
  now?: Date;
  inactivityDays?: number;
}): TaskManagerCandidate[] {
  const now = input.now ?? new Date();
  const inactivityMs = (input.inactivityDays ?? 3) * 86_400_000;
  const result: TaskManagerCandidate[] = [];
  const open = (status: string) => status === 'todo' || status === 'in_progress';
  const emit = (c: Omit<TaskManagerCandidate, 'fingerprint'>) => result.push({ ...c, fingerprint: [c.type, input.task.id, c.subtaskId ?? '', c.recipientUserId, JSON.stringify(c.evidence)].join('|') });
  const route = `/tasks/${input.task.id}`;

  if (open(input.task.status) && input.task.dueDate) {
    const hours = (input.task.dueDate.getTime() - now.getTime()) / 3_600_000;
    if (hours <= 48 && hours > 0) emit({ type: 'ai_upcoming_deadline', recipientUserId: input.task.userId, severity: hours <= 12 ? 'warning' : 'recommendation', title: 'Deadline approaching', summary: `${input.task.title} is due within ${Math.ceil(hours)} hours.`, explanation: 'The task is still open and its accepted deadline is close.', evidence: [{ field: 'dueDate', value: input.task.dueDate.toISOString() }, { field: 'hoursRemaining', value: Math.round(hours) }], confidence: 99, action: { label: 'Open task', kind: 'open_task', route }, expiresAt: input.task.dueDate });
    if (hours <= 0) emit({ type: 'task_overdue', recipientUserId: input.task.userId, severity: 'critical', title: 'Work is overdue', summary: `${input.task.title} passed its deadline without being completed.`, explanation: 'The task deadline has passed while the task remains open.', evidence: [{ field: 'dueDate', value: input.task.dueDate.toISOString() }, { field: 'status', value: input.task.status }], confidence: 100, action: { label: 'Open task', kind: 'open_task', route } });
  }
  for (const subtask of input.subtasks) {
    if (!open(subtask.status)) continue;
    const evidence: Record<string, unknown>[] = [{ field: 'lastUpdatedAt', value: subtask.updatedAt.toISOString() }];
    if (now.getTime() - subtask.updatedAt.getTime() >= inactivityMs) emit({ type: 'ai_inactivity', subtaskId: subtask.id, recipientUserId: subtask.assigneeUserId ?? input.task.userId, severity: 'warning', title: 'Task needs an update', summary: `${subtask.title} has had no meaningful update for ${input.inactivityDays ?? 3} days.`, explanation: 'The work is open but its last recorded update is older than the configured inactivity window. This is a coordination signal, not a performance judgment.', evidence, confidence: 92, action: { label: 'Open task', kind: 'open_task', route } });
    if (!subtask.assigneeUserId || !subtask.estimatedDurationMinutes) emit({ type: 'ai_missing_assignment', subtaskId: subtask.id, recipientUserId: input.task.userId, severity: 'recommendation', title: 'Subtask needs planning details', summary: `${subtask.title} is missing an assignee or estimate.`, explanation: 'Without both fields, workload and deadline forecasts cannot be reliable.', evidence: [{ field: 'assigneeUserId', value: subtask.assigneeUserId }, { field: 'estimatedDurationMinutes', value: subtask.estimatedDurationMinutes }], confidence: 98, action: { label: 'Open task', kind: 'open_task', route } });
    const blockedBy = input.dependencies.filter((d) => d.subtaskId === subtask.id && !d.completed);
    if (blockedBy.length) emit({ type: 'ai_blocked_dependency', subtaskId: subtask.id, recipientUserId: subtask.assigneeUserId ?? input.task.userId, severity: 'warning', title: 'Work is blocked', summary: `${subtask.title} cannot start until a dependency is complete.`, explanation: 'An open dependency is linked to this subtask, so starting it now would be premature.', evidence: blockedBy.map((d) => ({ field: 'dependsOnSubtaskId', value: d.dependsOnSubtaskId })), confidence: 97, action: { label: 'Open task', kind: 'open_task', route } });
    if (subtask.dueDate) {
      const hours = (subtask.dueDate.getTime() - now.getTime()) / 3_600_000;
      if (hours <= 48 && hours > 0) emit({ type: 'ai_upcoming_deadline', subtaskId: subtask.id, recipientUserId: subtask.assigneeUserId ?? input.task.userId, severity: hours <= 12 ? 'warning' : 'recommendation', title: 'Subtask deadline approaching', summary: `${subtask.title} is due within ${Math.ceil(hours)} hours.`, explanation: 'The subtask remains open and its deadline is close.', evidence: [{ field: 'dueDate', value: subtask.dueDate.toISOString() }, { field: 'hoursRemaining', value: Math.round(hours) }], confidence: 99, action: { label: 'Open task', kind: 'open_task', route }, expiresAt: subtask.dueDate });
      if (hours <= 0) emit({ type: 'task_overdue', subtaskId: subtask.id, recipientUserId: subtask.assigneeUserId ?? input.task.userId, severity: 'critical', title: 'Subtask is overdue', summary: `${subtask.title} passed its deadline.`, explanation: 'The subtask deadline has passed while it remains open.', evidence: [{ field: 'dueDate', value: subtask.dueDate.toISOString() }], confidence: 100, action: { label: 'Open task', kind: 'open_task', route } });
    }
  }
  return result;
}
