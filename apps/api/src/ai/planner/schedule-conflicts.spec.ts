import { detectScheduleConflicts, overlapMinutes, unresolvedScheduleConflicts } from './schedule-conflicts';
import type { DailyPlanItem, PlannerCommitment } from './planner.types';

const commitment: PlannerCommitment = {
  id: 'commitment-1',
  title: 'Class',
  start: '10:00',
  end: '11:00',
};

function task(startTime: string, endTime: string): DailyPlanItem {
  return {
    id: 'task-1',
    taskId: 'task-1',
    type: 'task',
    title: 'Write report',
    startTime,
    endTime,
    durationMinutes: overlapMinutes(startTime, endTime, '00:00', '23:59'),
    priority: 'high',
    isFocusTask: true,
  };
}

describe('schedule conflict detection', () => {
  it.each([
    ['AI scheduling conflict', '09:45', '10:15'],
    ['manual scheduling conflict', '10:15', '10:45'],
    ['drag and drop conflict', '10:30', '11:30'],
    ['task duration conflict', '09:30', '10:01'],
    ['commitment edit conflict', '09:00', '10:30'],
  ])('detects %s for any overlap greater than zero', (_name, start, end) => {
    const [conflict] = detectScheduleConflicts([task(start, end)], [commitment]);

    expect(conflict).toMatchObject({
      task: { itemId: 'task-1', isFocusTask: true },
      commitment: { id: 'commitment-1' },
    });
    expect(conflict.conflictMinutes).toBeGreaterThan(0);
  });

  it('does not report adjacent blocks as conflicts', () => {
    expect(detectScheduleConflicts([task('09:00', '10:00')], [commitment])).toEqual([]);
    expect(detectScheduleConflicts([task('11:00', '12:00')], [commitment])).toEqual([]);
  });

  it('reports the exact overlap duration', () => {
    expect(detectScheduleConflicts([task('10:45', '11:15')], [commitment])[0].conflictMinutes).toBe(15);
  });

  it('discovers an existing accepted-plan conflict during load', () => {
    expect(unresolvedScheduleConflicts([task('10:15', '10:45')], [commitment], new Set())).toHaveLength(1);
  });

  it('does not prompt again after the exact conflict was resolved', () => {
    const detected = detectScheduleConflicts([task('10:15', '10:45')], [commitment]);
    expect(unresolvedScheduleConflicts([task('10:15', '10:45')], [commitment], new Set([detected[0].id]))).toEqual([]);
  });

  it('detects a new conflict when a previously resolved task time changes', () => {
    const old = detectScheduleConflicts([task('10:15', '10:45')], [commitment])[0];
    expect(unresolvedScheduleConflicts([task('10:30', '11:15')], [commitment], new Set([old.id]))).toHaveLength(1);
  });
});
