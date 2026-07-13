import type {
  CollaborationPlanItem,
  EligibleMember,
} from './collaboration-plan.types';
import {
  rebalanceWorkload,
  sanitizeAndMinimizeDependencies,
  scheduleItems,
  validateFinalPlan,
} from './plan-graph';

function item(
  proposalId: string,
  activityType: CollaborationPlanItem['activityType'],
  assigneeUserId: string,
  dependsOnProposalIds: string[] = [],
  extra: Partial<CollaborationPlanItem> = {},
): CollaborationPlanItem {
  return {
    proposalId,
    title: extra.title ?? proposalId,
    description: '',
    assigneeUserId,
    assigneeDisplayName: assigneeUserId,
    estimatedDurationMinutes: 30,
    suggestedStart: null,
    suggestedDue: null,
    priority: 'medium',
    order: 1,
    dependsOnProposalIds,
    canRunInParallel: true,
    reason: '',
    assumptions: [],
    warnings: [],
    activityType,
    sharedSessionId: null,
    ...extra,
  };
}

describe('collaboration plan graph', () => {
  it('returns only sanitized minimal dependency IDs without using duplicate titles', () => {
    const items = [
      item('prep-1', 'preparation', 'a', ['prep-1', 'study-1']),
      item('prep-2', 'preparation', 'b', [], { title: 'Duplicate' }),
      item('study-1', 'study_review', 'a', ['prep-1', 'prep-2'], {
        title: 'Duplicate',
      }),
      item('practice-1', 'practice', 'a', ['prep-1', 'study-1', 'missing']),
    ];

    const result = sanitizeAndMinimizeDependencies(items).items;
    expect(
      result.find((entry) => entry.proposalId === 'prep-1')!
        .dependsOnProposalIds,
    ).toEqual([]);
    expect(
      result.find((entry) => entry.proposalId === 'practice-1')!
        .dependsOnProposalIds,
    ).toEqual(['study-1']);
    expect(result.flatMap((entry) => entry.dependsOnProposalIds)).not.toContain(
      'Duplicate',
    );
  });

  it('synchronizes shared attendees, removes peer edges, and waits for every attendee prerequisite', () => {
    const now = new Date('2026-01-01T09:00:00.000Z');
    const sanitized = sanitizeAndMinimizeDependencies([
      item('prep-a', 'preparation', 'a', [], { estimatedDurationMinutes: 30 }),
      item('prep-b', 'preparation', 'b', [], { estimatedDurationMinutes: 60 }),
      item('study-a', 'study_review', 'a', ['prep-a']),
      item('study-b', 'study_review', 'b', ['prep-b']),
      item('session-a', 'shared_session', 'a', ['study-a', 'session-b'], {
        sharedSessionId: 'session',
        estimatedDurationMinutes: 45,
      }),
      item('session-b', 'shared_session', 'b', ['study-b', 'session-a'], {
        sharedSessionId: 'session',
        estimatedDurationMinutes: 45,
      }),
    ]).items;
    const scheduled = scheduleItems(sanitized, {
      now,
      taskDueDate: null,
      recoveryMode: false,
    }).items;
    const a = scheduled.find((entry) => entry.proposalId === 'session-a')!;
    const b = scheduled.find((entry) => entry.proposalId === 'session-b')!;
    expect(a.dependsOnProposalIds).toEqual(['study-a']);
    expect(b.dependsOnProposalIds).toEqual(['study-b']);
    expect(a.suggestedStart).toBe(b.suggestedStart);
    expect(a.suggestedDue).toBe(b.suggestedDue);
    expect(a.suggestedStart).toBe('2026-01-01T10:30:00.000Z');
  });

  it('rejects shared attendees with different final prerequisite sets', () => {
    const scheduled = scheduleItems(
      [
        item('study-a', 'study_review', 'a'),
        item('study-b', 'study_review', 'b'),
        item('session-a', 'shared_session', 'a', ['study-a'], {
          sharedSessionId: 'session',
        }),
        item('session-b', 'shared_session', 'b', ['study-b'], {
          sharedSessionId: 'session',
        }),
      ],
      {
        now: new Date('2026-01-01T09:00:00Z'),
        taskDueDate: null,
        recoveryMode: false,
      },
    ).items;
    expect(validateFinalPlan(scheduled)).toContain(
      'Shared session session attendees do not have identical prerequisites.',
    );
  });

  it('schedules error analysis after the participant practice and validates chronology', () => {
    const scheduled = scheduleItems(
      [
        item('study', 'study_review', 'a'),
        item('practice', 'practice', 'a', ['study']),
        item('errors', 'error_analysis', 'a', ['practice']),
      ],
      {
        now: new Date('2026-01-01T09:00:00.000Z'),
        taskDueDate: null,
        recoveryMode: false,
      },
    ).items;
    const practice = scheduled.find(
      (entry) => entry.proposalId === 'practice',
    )!;
    const errors = scheduled.find((entry) => entry.proposalId === 'errors')!;
    expect(new Date(errors.suggestedStart!).getTime()).toBeGreaterThanOrEqual(
      new Date(practice.suggestedDue!).getTime(),
    );
    expect(validateFinalPlan(scheduled)).toEqual([]);
  });

  it('balances feasible flexible workload to within five percent', () => {
    const members = new Map<string, EligibleMember>([
      ['a', { userId: 'a', displayName: 'A' }],
      ['b', { userId: 'b', displayName: 'B' }],
    ]);
    const result = rebalanceWorkload(
      [
        item('a-prep', 'preparation', 'a', [], {
          estimatedDurationMinutes: 100,
        }),
        item('b-prep', 'preparation', 'b', [], {
          estimatedDurationMinutes: 70,
        }),
      ],
      ['a', 'b'],
      members,
    );
    const totals = ['a', 'b'].map((id) =>
      result.items
        .filter((entry) => entry.assigneeUserId === id)
        .reduce((sum, entry) => sum + entry.estimatedDurationMinutes, 0),
    );
    const average = (totals[0] + totals[1]) / 2;
    expect(result.balanced).toBe(true);
    expect(Math.max(...totals) - Math.min(...totals)).toBeLessThanOrEqual(
      average * 0.05,
    );
  });
});
