import { BadRequestException } from '@nestjs/common';
import { findTaskCommitmentConflicts, findTaskTimeConflicts, nearestAvailableSlot, normalizeScheduledInterval, taskOverlapMinutes, type CommitmentBusyInterval, type ScheduledTaskCandidate } from './task-schedule-conflicts';

const task = (id: string, start: string, end: string, date = '2026-07-29'): ScheduledTaskCandidate => ({
  id, title: id, priority: 'medium', dueDate: '2026-08-15T00:00:00.000Z',
  durationMinutes: Number(end.slice(0, 2)) * 60 + Number(end.slice(3)) - (Number(start.slice(0, 2)) * 60 + Number(start.slice(3))),
  scheduledDate: date, scheduledStartTime: start, scheduledEndTime: end,
});

describe('task schedule model', () => {
  it('keeps unscheduled tasks valid with null schedule fields', () => {
    expect(normalizeScheduledInterval({ scheduledDate: null, scheduledStartTime: null, scheduledEndTime: null })).toBeNull();
  });

  it('derives and persists an end time once from start plus duration', () => {
    expect(normalizeScheduledInterval({ scheduledDate: '2026-07-29', scheduledStartTime: '09:15', estimatedMinutes: 75 })).toEqual({
      scheduledDate: '2026-07-29', scheduledStartTime: '09:15', scheduledEndTime: '10:30',
    });
  });

  it('rejects an end time that is not after the start', () => {
    expect(() => normalizeScheduledInterval({ scheduledDate: '2026-07-29', scheduledStartTime: '10:00', scheduledEndTime: '10:00' })).toThrow(BadRequestException);
  });

  it('keeps deadline semantics separate from schedule overlap', () => {
    const first = task('a', '10:00', '11:00');
    const second = { ...task('b', '10:30', '11:30'), dueDate: '2030-01-01T00:00:00.000Z' };
    expect(taskOverlapMinutes(first, second)).toBe(30);
    expect(first.dueDate).not.toBe(second.dueDate);
  });
});

describe('task-to-task overlap', () => {
  it.each(['create', 'edit', 'drag', 'existing schedule load'])('detects overlap during %s', () => {
    expect(findTaskTimeConflicts(task('new', '10:30', '11:30'), [task('existing', '10:00', '11:00')])[0].overlapMinutes).toBe(30);
  });

  it('allows adjacent tasks', () => {
    expect(findTaskTimeConflicts(task('b', '11:00', '12:00'), [task('a', '10:00', '11:00')])).toEqual([]);
  });

  it('does not compare tasks on different dates', () => {
    expect(findTaskTimeConflicts(task('b', '10:00', '11:00', '2026-07-30'), [task('a', '10:00', '11:00')])).toEqual([]);
  });

  it('suppresses the exact resolved conflict but detects it again after a time change', () => {
    const existing = task('a', '10:00', '11:00');
    const proposed = task('b', '10:30', '11:30');
    const conflict = findTaskTimeConflicts(proposed, [existing])[0];
    expect(findTaskTimeConflicts(proposed, [existing], new Set([conflict.id]))).toEqual([]);
    expect(findTaskTimeConflicts(task('b', '10:45', '11:45'), [existing], new Set([conflict.id]))).toHaveLength(1);
  });

  it('finds the nearest non-overlapping automatic move', () => {
    expect(nearestAvailableSlot(task('moving', '10:30', '11:00'), [task('fixed', '10:00', '11:00')])).toEqual({
      scheduledDate: '2026-07-29', scheduledStartTime: '11:00', scheduledEndTime: '11:30',
    });
  });
});

describe('task-to-commitment overlap', () => {
  const commitment: CommitmentBusyInterval = {
    commitmentId: 'weekly-class',
    title: 'Weekly class',
    date: '2026-07-29',
    startTime: '12:00',
    endTime: '13:00',
  };

  it.each([
    ['exact', '12:00', '13:00', 60],
    ['partial', '12:30', '13:30', 30],
    ['task contains commitment', '11:30', '13:30', 60],
    ['commitment contains task', '12:15', '12:45', 30],
  ])('detects %s overlap', (_label, start, end, overlap) => {
    expect(findTaskCommitmentConflicts(task('new', start, end), [commitment])[0])
      .toMatchObject({ conflictType: 'task_commitment', overlapMinutes: overlap });
  });

  it('allows adjacent intervals and different dates', () => {
    expect(findTaskCommitmentConflicts(task('after', '13:00', '14:00'), [commitment])).toEqual([]);
    expect(findTaskCommitmentConflicts(task('other-day', '12:00', '13:00', '2026-07-30'), [commitment])).toEqual([]);
  });

  it('moves around both tasks and commitment busy intervals', () => {
    expect(nearestAvailableSlot(task('moving', '12:00', '13:00'), [{
      scheduledDate: commitment.date,
      scheduledStartTime: commitment.startTime,
      scheduledEndTime: commitment.endTime,
    }])).toEqual({
      scheduledDate: '2026-07-29',
      scheduledStartTime: '11:00',
      scheduledEndTime: '12:00',
    });
  });
});
