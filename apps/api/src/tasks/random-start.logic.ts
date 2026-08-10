export type RandomStartMode = 'anything' | 'quick_win' | 'important';

export type RandomStartTask = {
  id: string;
  title: string;
  userId?: string;
  candidateKey?: string;
  itemType?: 'task' | 'subtask';
  taskId?: string;
  parentTitle?: string;
  status?: string | null;
  priority?: string | null;
  dueDate?: string | Date | null;
  estimatedTimeMinutes?: number | null;
  isDone?: boolean | null;
  isBlocked?: boolean | null;
  dependenciesComplete?: boolean | null;
  dependencies?: Array<{ id?: string; title?: string; status?: string | null }>;
  canEdit?: boolean | null;
  dependencyCount?: number;
  incompleteDependencyCount?: number;
  dependencyTitles?: string[];
};

export type RandomStartSubtask = RandomStartTask & {
  id: string;
  taskId: string;
  isDone?: boolean | null;
  dependencyIds?: string[];
};

export type RandomStartTaskWithSubtasks = RandomStartTask & {
  subtasks?: RandomStartSubtask[];
};

export function getEligibleRandomStartTasks(tasks: RandomStartTask[]) {
  return tasks.filter((task) =>
    task.status !== 'done' &&
    task.status !== 'deleted' &&
    task.status !== 'archived' &&
    task.isDone !== true,
  );
}

/**
 * Random Start is deliberately permissive: dependencies and planner readiness
 * are metadata, never eligibility. It only removes completed work while
 * preserving the established parent-to-visible-subtask candidate shape.
 */
export function getEligibleRandomStartCandidates(
  tasks: RandomStartTaskWithSubtasks[],
) {
  return tasks.flatMap((task) => {
    if (!task.subtasks?.length) {
      const dependencies = task.dependencies ?? [];
      const incompleteDependencies = dependencies.filter((dependency) => dependency.status !== 'done');
      return getEligibleRandomStartTasks([{
        ...task,
        itemType: 'task',
        candidateKey: `task:${task.id}`,
        dependencyCount: dependencies.length,
        incompleteDependencyCount: incompleteDependencies.length,
        dependencyTitles: incompleteDependencies.flatMap((dependency) => dependency.title ? [dependency.title] : []),
      }]);
    }

    if (task.status === 'done' || task.isDone === true) return [];

    const subtaskById = new Map(task.subtasks.map((subtask) => [subtask.id, subtask]));
    return getEligibleRandomStartTasks(task.subtasks.map((subtask) => {
      const dependencyIds = subtask.dependencyIds ?? [];
      const incompleteDependencies = dependencyIds
        .map((dependencyId) => subtaskById.get(dependencyId))
        .filter((dependency): dependency is RandomStartSubtask => dependency !== undefined)
        .filter((dependency) => dependency.status !== 'done' && dependency.isDone !== true);
      return {
        ...subtask,
        itemType: 'subtask' as const,
        candidateKey: `subtask:${subtask.id}`,
        taskId: task.id,
        parentTitle: task.title,
        priority: subtask.priority ?? task.priority,
        dueDate: subtask.dueDate ?? task.dueDate,
        estimatedTimeMinutes: subtask.estimatedTimeMinutes ?? task.estimatedTimeMinutes,
        dependencyCount: dependencyIds.length,
        incompleteDependencyCount: incompleteDependencies.length,
        dependencyTitles: incompleteDependencies.map((dependency) => dependency.title),
      };
    }));
  });
}

export function getRandomStartWeight(
  task: RandomStartTask,
  mode: RandomStartMode = 'anything',
  now = new Date(),
) {
  let weight = 1;
  const due = task.dueDate ? new Date(task.dueDate).getTime() : NaN;
  const daysUntilDue = Number.isFinite(due)
    ? (due - now.getTime()) / 86_400_000
    : null;

  if (daysUntilDue !== null) {
    if (daysUntilDue < 0) weight += 4;
    else if (daysUntilDue <= 1) weight += 3;
    else if (daysUntilDue <= 3) weight += 1.5;
  }
  if (task.priority === 'urgent') weight += 4;
  else if (task.priority === 'high') weight += 2.5;
  else if (task.priority === 'medium') weight += 0.5;

  if (mode === 'quick_win' && typeof task.estimatedTimeMinutes === 'number' && task.estimatedTimeMinutes > 0) {
    weight += Math.max(0, 4 - Math.min(task.estimatedTimeMinutes, 240) / 60);
  }
  if (mode === 'important' && (daysUntilDue !== null && daysUntilDue <= 3 || task.priority === 'high' || task.priority === 'urgent')) {
    weight += 3;
  }
  return Math.max(0.1, weight);
}

export function selectWeightedRandomStart<T extends RandomStartTask>(
  tasks: T[],
  options: { mode?: RandomStartMode; random?: () => number; now?: Date; excludeId?: string } = {},
) {
  const eligible = getEligibleRandomStartTasks(tasks);
  const excludeKey = options.excludeId;
  const alternatives = options.excludeId && eligible.length > 1
    ? eligible.filter((task) => (task.candidateKey ?? task.id) !== excludeKey)
    : eligible;
  if (!alternatives.length) return null;

  const total = alternatives.reduce(
    (sum, task) => sum + getRandomStartWeight(task, options.mode, options.now),
    0,
  );
  const target = Math.min(0.999999999, Math.max(0, options.random?.() ?? Math.random())) * total;
  let cursor = 0;
  for (const task of alternatives) {
    cursor += getRandomStartWeight(task, options.mode, options.now);
    if (target < cursor) return task;
  }
  return alternatives[alternatives.length - 1];
}
