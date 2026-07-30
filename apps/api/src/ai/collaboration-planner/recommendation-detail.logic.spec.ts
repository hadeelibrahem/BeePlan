import {
  blockersFor,
  buildDetailedRecommendation,
  confidenceFor,
  describeChanges,
  evidenceFor,
  toAffectedItem,
  type RecommendationAffectedItem,
  type RecommendationBase,
} from './recommendation-detail.logic';
import type { PlanChange } from './recommendation-changes';

const NOW = '2026-07-27T12:00:00.000Z';
const START = '2026-07-28T09:00:00.000Z';

const PEOPLE = new Map([
  ['u1', 'Alice'],
  ['u2', 'Bilal'],
]);

function item(over: Partial<RecommendationAffectedItem> = {}): RecommendationAffectedItem {
  return {
    subtaskId: 'sub-1',
    title: 'Write the intro',
    status: 'todo',
    isComplete: false,
    assignee: { userId: 'u1', displayName: 'Alice' },
    estimatedDurationMinutes: 60,
    startDate: null,
    dueDate: '2026-07-30T00:00:00.000Z',
    ...over,
  };
}

function base(over: Partial<RecommendationBase> = {}): RecommendationBase {
  return {
    id: 'rec-1',
    kind: 'workload_imbalance',
    status: 'pending',
    targetUserId: 'u1',
    title: 'Workload is uneven — rebalance?',
    message: 'Move "Write the intro" to someone with more room?',
    reason: 'Remaining workload is 2x higher for this member.',
    createdAt: NOW,
    resolvedAt: null,
    resolutionReason: null,
    ...over,
  };
}

const REASSIGN: PlanChange = {
  kind: 'reassign',
  subtaskId: 'sub-1',
  assigneeUserId: 'u2',
  fromUserId: 'u1',
};
const RESCHEDULE: PlanChange = { kind: 'reschedule', subtaskId: 'sub-1', startDate: START };

describe('confidenceFor — levels, never percentages', () => {
  it('is high with complete scheduling data', () => {
    const confidence = confidenceFor({
      changes: [REASSIGN],
      items: [item()],
      forecastStatus: 'available',
    });
    expect(confidence.level).toBe('high');
    expect(confidence.reason).toBe('Complete scheduling data');
    expect(confidence.basis[0]).toContain('has a time estimate');
  });

  it('is medium for a single missing estimate', () => {
    const confidence = confidenceFor({
      changes: [REASSIGN],
      items: [item({ estimatedDurationMinutes: null })],
      forecastStatus: 'available',
    });
    expect(confidence.level).toBe('medium');
    expect(confidence.reason).toBe('Minor estimate uncertainty');
    expect(confidence.basis.join(' ')).toContain('no time estimate');
  });

  it('is medium when a rescheduled item has no due date', () => {
    const confidence = confidenceFor({
      changes: [RESCHEDULE],
      items: [item({ dueDate: null })],
      forecastStatus: 'available',
    });
    expect(confidence.level).toBe('medium');
    expect(confidence.basis.join(' ')).toContain('only the start date moves');
  });

  it('is medium when the forecast could only be partly computed', () => {
    const confidence = confidenceFor({
      changes: [REASSIGN],
      items: [item()],
      forecastStatus: 'partial',
    });
    expect(confidence.level).toBe('medium');
    expect(confidence.basis.join(' ')).toContain('partial');
  });

  it('is low when several assumptions are required', () => {
    const confidence = confidenceFor({
      changes: [RESCHEDULE],
      items: [item({ estimatedDurationMinutes: null, assignee: null })],
      forecastStatus: 'available',
    });
    expect(confidence.level).toBe('low');
    expect(confidence.reason).toBe('Several assumptions required');
  });

  it('is unavailable when the referenced work cannot be resolved', () => {
    const confidence = confidenceFor({ changes: [REASSIGN], items: [], forecastStatus: 'available' });
    expect(confidence.level).toBe('unavailable');
    expect(confidence.reason).toBe('Insufficient project data');
  });

  it('is unavailable when the forecast itself cannot run', () => {
    const confidence = confidenceFor({
      changes: [REASSIGN],
      items: [item()],
      forecastStatus: 'unavailable',
    });
    expect(confidence.level).toBe('unavailable');
    expect(confidence.basis.join(' ')).toContain('cannot run');
  });

  // The whole point of dropping the numeric score: "0%" told a user nothing.
  it('never exposes a numeric percentage', () => {
    for (const status of ['available', 'partial', 'unavailable'] as const) {
      const confidence = confidenceFor({ changes: [REASSIGN], items: [item()], forecastStatus: status });
      expect(confidence).not.toHaveProperty('percent');
      expect(confidence.reason).toBeTruthy();
    }
  });
});

describe('blockersFor', () => {
  it('has nothing to report for a clean, applicable recommendation', () => {
    expect(blockersFor({ changes: [REASSIGN], items: [item()], status: 'pending' })).toEqual([]);
  });

  it('reports a missing item', () => {
    const blockers = blockersFor({ changes: [REASSIGN], items: [], status: 'pending' });
    expect(blockers).toEqual(['The item this recommendation refers to no longer exists.']);
  });

  it('reports work that has since been completed', () => {
    const blockers = blockersFor({
      changes: [REASSIGN],
      items: [item({ isComplete: true })],
      status: 'pending',
    });
    expect(blockers[0]).toContain('already complete');
  });

  it('reports a reassign that would be a no-op', () => {
    const blockers = blockersFor({
      changes: [{ ...REASSIGN, assigneeUserId: 'u1' }],
      items: [item()],
      status: 'pending',
    });
    expect(blockers[0]).toContain('already assigned to Alice');
  });

  it('reports a payload that no longer maps to any change', () => {
    const blockers = blockersFor({ changes: [], items: [], status: 'pending' });
    expect(blockers).toEqual([
      'This recommendation no longer describes a change that can be applied.',
    ]);
  });

  it('stays silent for an already-resolved recommendation (nothing left to block)', () => {
    expect(blockersFor({ changes: [], items: [], status: 'approved' })).toEqual([]);
  });
});

describe('evidenceFor / describeChanges', () => {
  it('leads with the detector reason then states each item plainly', () => {
    const evidence = evidenceFor({
      reason: 'Remaining workload is 2x higher.',
      items: [item()],
      target: { userId: 'u1', displayName: 'Alice' },
    });
    expect(evidence[0]).toBe('Remaining workload is 2x higher.');
    expect(evidence[1]).toContain('assigned to Alice');
    expect(evidence[1]).toContain('estimated 1h');
    expect(evidence.at(-1)).toContain('Subject of the finding: Alice');
  });

  it('says "no estimate" instead of inventing one', () => {
    const [, line] = evidenceFor({
      reason: 'r',
      items: [item({ estimatedDurationMinutes: null })],
      target: null,
    });
    expect(line).toContain('no estimate');
  });

  it('describes a reassign with both real names', () => {
    const [change] = describeChanges({ changes: [REASSIGN], items: [item()], peopleById: PEOPLE });
    expect(change.summary).toBe('Reassign "Write the intro" from Alice to Bilal.');
  });

  it('describes a reschedule and names the item', () => {
    const [change] = describeChanges({ changes: [RESCHEDULE], items: [item()], peopleById: PEOPLE });
    expect(change.kind).toBe('reschedule');
    expect(change.summary).toContain('Write the intro');
  });
});

describe('buildDetailedRecommendation — permissions', () => {
  const build = (viewerRole: 'owner' | 'editor' | 'viewer', over: Partial<RecommendationBase> = {}) =>
    buildDetailedRecommendation({
      recommendation: base(over),
      changes: [REASSIGN],
      items: [item()],
      peopleById: PEOPLE,
      viewerRole,
    });

  it.each(['owner', 'editor'] as const)('lets %s approve and dismiss', (role) => {
    const detail = build(role);
    expect(detail.canApprove).toBe(true);
    expect(detail.canDismiss).toBe(true);
    expect(detail.canPreview).toBe(true);
  });

  it('lets a viewer inspect and preview but never act', () => {
    const detail = build('viewer');
    expect(detail.canApprove).toBe(false);
    expect(detail.canDismiss).toBe(false);
    expect(detail.canPreview).toBe(true);
  });

  it('withholds approval from an editor when the recommendation is blocked', () => {
    const detail = buildDetailedRecommendation({
      recommendation: base(),
      changes: [REASSIGN],
      items: [item({ isComplete: true })],
      peopleById: PEOPLE,
      viewerRole: 'editor',
    });
    expect(detail.canApprove).toBe(false);
    expect(detail.blockers).toHaveLength(1);
  });

  it.each(['approved', 'dismissed', 'auto_resolved'])('offers no action on a %s recommendation', (status) => {
    const detail = build('owner', { status });
    expect(detail.canApprove).toBe(false);
    expect(detail.canDismiss).toBe(false);
    expect(detail.canPreview).toBe(false);
  });

  it('cannot preview a recommendation with no derivable change', () => {
    const detail = buildDetailedRecommendation({
      recommendation: base(),
      changes: [],
      items: [],
      peopleById: PEOPLE,
      viewerRole: 'owner',
    });
    expect(detail.canPreview).toBe(false);
    expect(detail.canApprove).toBe(false);
  });
});

describe('buildDetailedRecommendation — explanation and navigation', () => {
  it('explains a known kind with problem, detection and expected improvement', () => {
    const detail = buildDetailedRecommendation({
      recommendation: base(),
      changes: [REASSIGN],
      items: [item()],
      peopleById: PEOPLE,
      viewerRole: 'owner',
    });
    expect(detail.kindLabel).toBe('Workload imbalance');
    expect(detail.explanation.problem).toContain('more remaining work');
    expect(detail.explanation.detection).toContain('1.5×');
    expect(detail.explanation.expectedImprovement).toContain('utilisation');
  });

  it('deep-links a team-shaped finding to Team, focused on the subject member', () => {
    const detail = buildDetailedRecommendation({
      recommendation: base({ kind: 'inactive_member', targetUserId: 'u1' }),
      changes: [REASSIGN],
      items: [item()],
      peopleById: PEOPLE,
      viewerRole: 'owner',
    });
    expect(detail.navigation.tab).toBe('team');
    expect(detail.navigation.focus).toEqual({ memberId: 'u1' });
  });

  it('deep-links a plan-shaped finding to Plan, focused on the affected items', () => {
    const detail = buildDetailedRecommendation({
      recommendation: base({ kind: 'deadline_risk', targetUserId: null }),
      changes: [RESCHEDULE],
      items: [item()],
      peopleById: PEOPLE,
      viewerRole: 'owner',
    });
    expect(detail.navigation.tab).toBe('plan');
    expect(detail.navigation.focus).toEqual({ itemIds: ['sub-1'] });
  });

  it('labels both sides of a move plus the subject, without duplicates', () => {
    const detail = buildDetailedRecommendation({
      recommendation: base({ targetUserId: 'u1' }),
      changes: [REASSIGN],
      items: [item()],
      peopleById: PEOPLE,
      viewerRole: 'owner',
    });
    expect(detail.affectedMembers).toEqual([
      { userId: 'u1', displayName: 'Alice', relation: 'subject' },
      { userId: 'u2', displayName: 'Bilal', relation: 'to' },
    ]);
  });

  it('falls back to a neutral explanation for an unrecognised kind', () => {
    const detail = buildDetailedRecommendation({
      recommendation: base({ kind: 'brand_new_check' }),
      changes: [REASSIGN],
      items: [item()],
      peopleById: PEOPLE,
      viewerRole: 'owner',
    });
    expect(detail.kindLabel).toBe('Recommendation');
    expect(detail.explanation.detection).toContain('deterministic');
  });
});

describe('toAffectedItem', () => {
  it('treats done and missed rows as complete', () => {
    const row = {
      id: 's',
      title: 'T',
      isDone: false,
      assigneeUserId: null,
      estimatedDurationMinutes: null,
      startDate: null,
      dueDate: null,
    };
    expect(toAffectedItem({ ...row, status: 'done' }, PEOPLE).isComplete).toBe(true);
    expect(toAffectedItem({ ...row, status: 'missed' }, PEOPLE).isComplete).toBe(true);
    expect(toAffectedItem({ ...row, status: 'todo' }, PEOPLE).isComplete).toBe(false);
    expect(toAffectedItem({ ...row, status: 'todo', isDone: true }, PEOPLE).isComplete).toBe(true);
  });

  it('resolves the assignee name and serialises dates', () => {
    const affected = toAffectedItem(
      {
        id: 's',
        title: 'T',
        status: 'todo',
        isDone: false,
        assigneeUserId: 'u2',
        estimatedDurationMinutes: 30,
        startDate: new Date(START),
        dueDate: null,
      },
      PEOPLE,
    );
    expect(affected.assignee).toEqual({ userId: 'u2', displayName: 'Bilal' });
    expect(affected.startDate).toBe(START);
    expect(affected.dueDate).toBeNull();
  });
});
