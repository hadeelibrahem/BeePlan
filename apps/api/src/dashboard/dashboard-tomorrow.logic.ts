export type DashboardDueUnit = {
  dueDate: Date | null;
  priority: string;
  status: string;
};

export function isActiveDueUnit(unit: DashboardDueUnit): boolean {
  return unit.status !== 'done' && unit.status !== 'missed';
}

/**
 * `tasks.due_date` is a timezone-less, date-only field; `due_time` is stored
 * separately. Drizzle serializes date-only input as UTC midnight, so comparing
 * its instant with a user's local-midnight boundary shifts it a day west of
 * UTC. Compare the stored calendar key instead.
 */
export function unitsForCalendarDate<T extends Pick<DashboardDueUnit, 'dueDate'>>(
  units: T[],
  date: string,
): T[] {
  return units.filter(
    (unit) => unit.dueDate !== null && unit.dueDate.toISOString().slice(0, 10) === date,
  );
}

export function dueUnitsForCalendarDate<T extends DashboardDueUnit>(
  units: T[],
  date: string,
): T[] {
  return unitsForCalendarDate(units, date).filter(isActiveDueUnit);
}

export function highPriorityDueUnitCount(units: DashboardDueUnit[]): number {
  return units.filter(
    (unit) => unit.priority === 'high' || unit.priority === 'urgent',
  ).length;
}

/**
 * The current planner UI only plans the current day. Tomorrow's existing
 * dashboard estimate therefore means the estimated workload due tomorrow,
 * not an accepted future planner timeline.
 */
type EstimatedTask = DashboardDueUnit & {
  id: string;
  estimatedMinutes: number | null | undefined;
};

type EstimatedSubtask = DashboardDueUnit & {
  taskId: string;
  isDone: boolean;
  estimatedMinutes: number | null | undefined;
};

const calendarKey = (value: Date | null) =>
  value?.toISOString().slice(0, 10) ?? null;

/**
 * Mirrors the planner's work-unit model: active subtasks replace their parent
 * as the estimate source. A subtask without its own due date inherits the
 * parent date, exactly as `toPlannerSubtask` does. This prevents a parent
 * estimate and its child estimates from being counted as separate work.
 */
export function estimatedMinutesForTomorrowWork(
  tasks: EstimatedTask[],
  subtasks: EstimatedSubtask[],
  tomorrowKey: string,
): number {
  const subtasksByTask = new Map<string, EstimatedSubtask[]>();
  for (const subtask of subtasks) {
    const list = subtasksByTask.get(subtask.taskId) ?? [];
    list.push(subtask);
    subtasksByTask.set(subtask.taskId, list);
  }

  return tasks.reduce((total, task) => {
    if (!isActiveDueUnit(task)) return total;
    const children = subtasksByTask.get(task.id) ?? [];
    const activeChildren = children.filter(
      (child) => !child.isDone && isActiveDueUnit(child),
    );

    if (activeChildren.length > 0) {
      return total + activeChildren.reduce(
        (childTotal, child) =>
          calendarKey(child.dueDate ?? task.dueDate) === tomorrowKey
            ? childTotal + Math.max(0, child.estimatedMinutes ?? 0)
            : childTotal,
        0,
      );
    }

    // A task with only completed/missed subtasks has no remaining work unit;
    // as in the planner, only a task with no subtasks represents itself.
    return children.length === 0 && calendarKey(task.dueDate) === tomorrowKey
      ? total + Math.max(0, task.estimatedMinutes ?? 0)
      : total;
  }, 0);
}
