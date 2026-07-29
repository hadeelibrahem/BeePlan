import type {
  DailyPlanItem,
  PlannerCommitment,
  ScheduleConflict,
} from './planner.types';
import { intervalOverlapMinutes } from '../../tasks/task-schedule-conflicts';

export function overlapMinutes(
  firstStart: string,
  firstEnd: string,
  secondStart: string,
  secondEnd: string,
): number {
  return intervalOverlapMinutes(firstStart, firstEnd, secondStart, secondEnd);
}

export function detectScheduleConflicts(
  items: DailyPlanItem[],
  commitments: PlannerCommitment[],
): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];
  for (const task of items.filter((item) => item.type === 'task')) {
    for (const commitment of commitments) {
      const duration = overlapMinutes(
        task.startTime,
        task.endTime,
        commitment.start,
        commitment.end,
      );
      if (duration <= 0) continue;
      conflicts.push({
        id: `${task.id}:${task.startTime}-${task.endTime}:${commitment.id}:${commitment.start}-${commitment.end}`,
        task: {
          itemId: task.id,
          taskId: task.taskId,
          subtaskId: task.subtaskId,
          title: task.title,
          startTime: task.startTime,
          endTime: task.endTime,
          durationMinutes: task.durationMinutes,
          isFocusTask: Boolean(task.isFocusTask),
        },
        commitment: {
          id: commitment.id,
          title: commitment.title,
          startTime: commitment.start,
          endTime: commitment.end,
        },
        conflictMinutes: duration,
      });
    }
  }
  return conflicts;
}

export function unresolvedScheduleConflicts(
  items: DailyPlanItem[],
  commitments: PlannerCommitment[],
  resolvedConflictKeys: ReadonlySet<string>,
): ScheduleConflict[] {
  return detectScheduleConflicts(items, commitments).filter(
    (conflict) => !resolvedConflictKeys.has(conflict.id),
  );
}
