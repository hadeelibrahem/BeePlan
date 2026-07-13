import type {
  CollaborationTaskType,
  EligibleMember,
} from '../collaboration-plan.types';

const RESPONSE_SCHEMA = `{"summary":string,"items":[{"proposalId":string,"title":string,"description":string,"assigneeUserId":string|null,"estimatedDurationMinutes":number,"priority":"low"|"medium"|"high"|"urgent","order":number,"dependsOnProposalIds":string[],"reason":string,"activityType":"preparation"|"study_review"|"practice"|"error_analysis"|"shared_session"|"production"|"other","sharedSessionId":string|null}]}`;

export type CollaborationPlanTaskContext = {
  title: string;
  description: string | null;
  category: string | null;
  priority: string;
  dueDate: string | null;
  dueTime: string | null;
  estimatedTimeMinutes: number;
};

export type CollaborationPlanExistingSubtask = {
  title: string;
  status: string;
  assignee: string | null;
};

export type CollaborationPlanPreferences = {
  workloadDistribution: 'equal' | 'availability' | 'role' | 'custom';
  includeOwner: boolean;
  maxWorkloadItemsPerPerson: number | null;
  allowParallelWork: boolean;
  addReviewSteps: boolean;
  addBufferTime: boolean;
  taskGranularity: 'coarse' | 'medium' | 'fine';
  notes: string | null;
};

export function buildCollaborationPlanPrompt(context: {
  task: CollaborationPlanTaskContext;
  owner: { userId: string; displayName: string };
  selectedMembers: (EligibleMember & { role: string })[];
  includeOwnerAsAssignee: boolean;
  preferences: CollaborationPlanPreferences;
  existingSubtasks: CollaborationPlanExistingSubtask[];
  now: Date;
  taskCollaborationType: CollaborationTaskType;
  recoveryMode: boolean;
}): string {
  const {
    task,
    owner,
    selectedMembers,
    includeOwnerAsAssignee,
    preferences,
    existingSubtasks,
  } = context;
  const people = [
    ...(includeOwnerAsAssignee
      ? [{ userId: owner.userId, name: owner.displayName, role: 'owner' }]
      : []),
    ...selectedMembers.map(({ userId, displayName, role }) => ({
      userId,
      name: displayName,
      role,
    })),
  ];
  const options = {
    granularity: preferences.taskGranularity,
    addReviewStep: preferences.addReviewSteps,
    maxItemsPerPerson: preferences.maxWorkloadItemsPerPerson,
    ownerNotes: preferences.notes,
  };

  return [
    'Create a concise collaboration plan. Use judgment only to identify useful subtasks, estimate effort, choose initial owners, describe outputs, and suggest logical order.',
    '',
    'Requirements:',
    '- Make each item concrete, distinct, and outcome-focused; do not duplicate existing subtasks.',
    '- Titles must describe the work only (e.g. "Study Subject 1"). Never embed a participant name or "Name:" prefix in a title — assignment is structural via assigneeUserId.',
    '- Assign only an exact userId from people. Use null when the task genuinely needs no owner.',
    '- Base assignments on the work and provided roles/notes; do not invent skills or availability.',
    '- Use dependencies only to express essential logical prerequisites.',
    context.taskCollaborationType === 'shared_outcome'
      ? '- Shared learning outcome: split resource preparation where useful, but include meaningful full-scope learning/practice for each participant. Label activityType accurately.'
      : '- Label ordinary deliverables as production; use another activityType only when clearly applicable.',
    '- For one synchronous session represented once per attendee, reuse one sharedSessionId; otherwise use null.',
    '',
    `Task: ${JSON.stringify({
      title: task.title,
      description: task.description,
      category: task.category,
      priority: task.priority,
      due: task.dueDate
        ? `${task.dueDate}${task.dueTime ? ` ${task.dueTime}` : ''}`
        : null,
      overallEstimateMinutes: task.estimatedTimeMinutes || null,
    })}`,
    `Existing: ${JSON.stringify(existingSubtasks)}`,
    `People: ${JSON.stringify(people)}`,
    `Options: ${JSON.stringify(options)}`,
    '',
    'Return JSON only, with this shape:',
    RESPONSE_SCHEMA,
  ].join('\n');
}
