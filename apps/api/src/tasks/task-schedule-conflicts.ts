import { BadRequestException } from '@nestjs/common';

export type ScheduledIntervalInput = {
  scheduledDate?: string | null;
  scheduledStartTime?: string | null;
  scheduledEndTime?: string | null;
  estimatedMinutes?: number | null;
};

export type ScheduledInterval = {
  scheduledDate: string;
  scheduledStartTime: string;
  scheduledEndTime: string;
};

export type ScheduledTaskCandidate = ScheduledInterval & {
  id: string;
  title: string;
  priority: string;
  dueDate: string | null;
  durationMinutes: number;
};

export type TaskTimeConflict = {
  id: string;
  existingTask: ScheduledTaskCandidate;
  proposedTask: ScheduledTaskCandidate;
  overlapMinutes: number;
};

export type CommitmentBusyInterval = {
  commitmentId: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
};

export type TaskCommitmentConflict = {
  id: string;
  conflictType: 'task_commitment';
  proposedTask: ScheduledTaskCandidate;
  commitment: CommitmentBusyInterval;
  overlapMinutes: number;
};

export function normalizeScheduledInterval(input: ScheduledIntervalInput): ScheduledInterval | null {
  const date = input.scheduledDate || null;
  const start = input.scheduledStartTime || null;
  let end = input.scheduledEndTime || null;
  if (!date && !start && !end) return null;
  if (!date || !start) throw new BadRequestException('scheduledDate and scheduledStartTime must be provided together.');
  if (!end) {
    const duration = Math.round(input.estimatedMinutes ?? 0);
    if (duration <= 0) throw new BadRequestException('scheduledEndTime or a positive estimated duration is required.');
    const endMinutes = toMinutes(start) + duration;
    if (endMinutes >= 24 * 60) throw new BadRequestException('The scheduled task must end on the same date.');
    end = fromMinutes(endMinutes);
  }
  if (toMinutes(end) <= toMinutes(start)) throw new BadRequestException('scheduledEndTime must be after scheduledStartTime.');
  return { scheduledDate: date, scheduledStartTime: start, scheduledEndTime: end };
}

export function taskOverlapMinutes(first: ScheduledInterval, second: ScheduledInterval): number {
  if (first.scheduledDate !== second.scheduledDate) return 0;
  return Math.max(0, Math.min(toMinutes(first.scheduledEndTime), toMinutes(second.scheduledEndTime)) - Math.max(toMinutes(first.scheduledStartTime), toMinutes(second.scheduledStartTime)));
}

export function intervalOverlapMinutes(
  firstStart: string,
  firstEnd: string,
  secondStart: string,
  secondEnd: string,
): number {
  return Math.max(
    0,
    Math.min(toMinutes(firstEnd), toMinutes(secondEnd)) -
      Math.max(toMinutes(firstStart), toMinutes(secondStart)),
  );
}

export function findTaskCommitmentConflicts(
  proposed: ScheduledTaskCandidate,
  commitments: CommitmentBusyInterval[],
  resolvedKeys: ReadonlySet<string> = new Set(),
): TaskCommitmentConflict[] {
  return commitments.flatMap((commitment) => {
    if (commitment.date !== proposed.scheduledDate) return [];
    const overlapMinutes = intervalOverlapMinutes(
      proposed.scheduledStartTime,
      proposed.scheduledEndTime,
      commitment.startTime,
      commitment.endTime,
    );
    if (overlapMinutes <= 0) return [];
    const id = commitmentConflictKey(proposed, commitment);
    return resolvedKeys.has(id)
      ? []
      : [{ id, conflictType: 'task_commitment', proposedTask: proposed, commitment, overlapMinutes }];
  });
}

export function commitmentConflictKey(
  task: ScheduledTaskCandidate,
  commitment: CommitmentBusyInterval,
): string {
  return `task:${task.id}:${task.scheduledDate}:${task.scheduledStartTime}-${task.scheduledEndTime}|commitment:${commitment.commitmentId}:${commitment.date}:${commitment.startTime}-${commitment.endTime}`;
}

export function findTaskTimeConflicts(
  proposed: ScheduledTaskCandidate,
  existing: ScheduledTaskCandidate[],
  resolvedKeys: ReadonlySet<string> = new Set(),
): TaskTimeConflict[] {
  return existing.flatMap((task) => {
    if (task.id === proposed.id) return [];
    const overlap = taskOverlapMinutes(task, proposed);
    if (overlap <= 0) return [];
    const id = conflictKey(task, proposed);
    return resolvedKeys.has(id) ? [] : [{ id, existingTask: task, proposedTask: proposed, overlapMinutes: overlap }];
  });
}

export function conflictKey(first: ScheduledTaskCandidate, second: ScheduledTaskCandidate): string {
  const [left, right] = [first, second].sort((a, b) => a.id.localeCompare(b.id));
  return `task:${left.id}:${left.scheduledDate}:${left.scheduledStartTime}-${left.scheduledEndTime}|task:${right.id}:${right.scheduledDate}:${right.scheduledStartTime}-${right.scheduledEndTime}`;
}

export function nearestAvailableSlot(
  task: ScheduledTaskCandidate,
  occupied: ScheduledInterval[],
): ScheduledInterval | null {
  const duration = task.durationMinutes;
  const original = toMinutes(task.scheduledStartTime);
  for (let distance = 5; distance < 24 * 60; distance += 5) {
    for (const start of [original - distance, original + distance]) {
      if (start < 0 || start + duration >= 24 * 60) continue;
      const candidate = { scheduledDate: task.scheduledDate, scheduledStartTime: fromMinutes(start), scheduledEndTime: fromMinutes(start + duration) };
      if (occupied.every((item) => taskOverlapMinutes(candidate, item) === 0)) return candidate;
    }
  }
  return null;
}

function toMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new BadRequestException('Scheduled times must use HH:mm.');
  }
  return hours * 60 + minutes;
}

function fromMinutes(value: number): string {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}
