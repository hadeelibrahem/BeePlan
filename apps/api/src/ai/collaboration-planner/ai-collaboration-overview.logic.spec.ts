import {
  buildAlerts,
  chooseDoThisNow,
  countBlocks,
  countOverdueOpen,
  deriveHealth,
  isBlockedByIncomplete,
  summarizePlan,
  summarizeTeam,
  type OverviewSubtask,
  type SubtaskDependencyEdge,
} from './ai-collaboration-overview.logic';
import type { MemberCapacity } from './workload-capacity.service';
import type { AiRecommendationEntity } from './ai-recommendations.service';

const USER = 'user-1';
const OTHER = 'user-2';
const TASK = { id: 'task-1', title: 'Group Project', status: 'todo', isShared: true };

const now = new Date('2026-07-25T12:00:00.000Z');
const past = new Date('2026-07-20T12:00:00.000Z');
const future = new Date('2026-07-30T12:00:00.000Z');

function sub(overrides: Partial<OverviewSubtask> = {}): OverviewSubtask {
  return {
    id: 'sub-1',
    title: 'Do work',
    status: 'todo',
    priority: 'medium',
    isFocusTask: false,
    isDone: false,
    isShared: false,
    assigneeUserId: USER,
    dueDate: future,
    estimatedDurationMinutes: 60,
    actualDurationMinutes: 0,
    ...overrides,
  };
}

describe('chooseDoThisNow — task vs subtask display', () => {
  it('recommends an owned executable SUBTASK over the parent task', () => {
    const subtasks = [sub({ id: 'sub-a', title: 'My subtask', assigneeUserId: USER })];
    const result = chooseDoThisNow({
      task: { ...TASK, dueDate: future },
      subtasks,
      edges: [],
      userId: USER,
      role: 'editor',
      now,
    });
    expect(result?.kind).toBe('subtask');
    expect(result?.subtaskId).toBe('sub-a');
    expect(result?.title).toBe('My subtask');
    expect(result?.parentTaskTitle).toBe('Group Project');
  });

  it('falls back to the parent TASK only for an owner of a shared task with no incomplete subtasks', () => {
    const result = chooseDoThisNow({
      task: { ...TASK, dueDate: future },
      subtasks: [sub({ status: 'done', isDone: true, assigneeUserId: OTHER })],
      edges: [],
      userId: USER,
      role: 'owner',
      now,
    });
    expect(result?.kind).toBe('task');
    expect(result?.subtaskId).toBeNull();
    expect(result?.title).toBe('Group Project');
  });

  it('personal execution filtering: returns null when no open subtask is assigned to the user', () => {
    const result = chooseDoThisNow({
      task: { ...TASK, dueDate: future },
      subtasks: [sub({ assigneeUserId: OTHER }), sub({ id: 'sub-2', assigneeUserId: null })],
      edges: [],
      userId: USER,
      role: 'editor',
      now,
    });
    expect(result).toBeNull();
  });

  it('prefers an unblocked owned subtask over a blocked one', () => {
    const blocked = sub({ id: 'blocked', title: 'Blocked', priority: 'urgent' });
    const ready = sub({ id: 'ready', title: 'Ready', priority: 'low' });
    const upstream = sub({ id: 'up', assigneeUserId: OTHER, status: 'todo', isDone: false });
    const edges: SubtaskDependencyEdge[] = [{ subtaskId: 'blocked', dependsOnSubtaskId: 'up' }];
    const result = chooseDoThisNow({
      task: { ...TASK, dueDate: future },
      subtasks: [blocked, ready, upstream],
      edges,
      userId: USER,
      role: 'editor',
      now,
    });
    expect(result?.subtaskId).toBe('ready');
    expect(result?.isBlocked).toBe(false);
  });
});

describe('chooseDoThisNow — permissions & states', () => {
  it('a viewer can never start focus even on their own item', () => {
    const result = chooseDoThisNow({
      task: { ...TASK, dueDate: future },
      subtasks: [sub()],
      edges: [],
      userId: USER,
      role: 'viewer',
      now,
    });
    expect(result?.canStartFocus).toBe(false);
  });

  it('an editor can start focus on an unblocked owned subtask', () => {
    const result = chooseDoThisNow({
      task: { ...TASK, dueDate: future },
      subtasks: [sub()],
      edges: [],
      userId: USER,
      role: 'editor',
      now,
    });
    expect(result?.canStartFocus).toBe(true);
  });

  it('flags overdue and reports downstream blocks count', () => {
    const target = sub({ id: 'root', dueDate: past });
    const edges: SubtaskDependencyEdge[] = [
      { subtaskId: 'd1', dependsOnSubtaskId: 'root' },
      { subtaskId: 'd2', dependsOnSubtaskId: 'root' },
    ];
    const result = chooseDoThisNow({
      task: { ...TASK, dueDate: past },
      subtasks: [target],
      edges,
      userId: USER,
      role: 'editor',
      now,
    });
    expect(result?.isOverdue).toBe(true);
    expect(result?.blocksCount).toBe(2);
  });

  it('missing optional data (no estimate) yields null estimatedRemainingMinutes', () => {
    const result = chooseDoThisNow({
      task: { ...TASK, dueDate: null },
      subtasks: [sub({ estimatedDurationMinutes: null, dueDate: null })],
      edges: [],
      userId: USER,
      role: 'editor',
      now,
    });
    expect(result?.estimatedRemainingMinutes).toBeNull();
    expect(result?.dueDate).toBeNull();
  });
});

describe('dependency helpers', () => {
  const upstreamDone = sub({ id: 'up', status: 'done', isDone: true });
  const upstreamOpen = sub({ id: 'up', status: 'todo', isDone: false });
  const byIdDone = new Map([[upstreamDone.id, upstreamDone]]);
  const byIdOpen = new Map([[upstreamOpen.id, upstreamOpen]]);
  const edges: SubtaskDependencyEdge[] = [{ subtaskId: 'x', dependsOnSubtaskId: 'up' }];

  it('is blocked when an upstream dependency is incomplete', () => {
    expect(isBlockedByIncomplete('x', edges, byIdOpen)).toBe(true);
  });
  it('is not blocked when the upstream dependency is complete', () => {
    expect(isBlockedByIncomplete('x', edges, byIdDone)).toBe(false);
  });
  it('counts downstream blocks', () => {
    expect(countBlocks('up', edges)).toBe(1);
  });
});

describe('deriveHealth — no fake scores', () => {
  it('returns null when there is no work', () => {
    expect(deriveHealth({ totalCount: 0, completedCount: 0, overdueOpenCount: 0, deadlineExceeded: false })).toBeNull();
  });
  it('complete when everything is done', () => {
    expect(deriveHealth({ totalCount: 3, completedCount: 3, overdueOpenCount: 0, deadlineExceeded: false })?.status).toBe('complete');
  });
  it('at_risk when overdue or deadline exceeded', () => {
    expect(deriveHealth({ totalCount: 3, completedCount: 1, overdueOpenCount: 1, deadlineExceeded: false })?.status).toBe('at_risk');
    expect(deriveHealth({ totalCount: 3, completedCount: 1, overdueOpenCount: 0, deadlineExceeded: true })?.status).toBe('at_risk');
  });
  it('on_track with progress and no risk; needs_attention with none started', () => {
    expect(deriveHealth({ totalCount: 3, completedCount: 1, overdueOpenCount: 0, deadlineExceeded: false })?.status).toBe('on_track');
    expect(deriveHealth({ totalCount: 3, completedCount: 0, overdueOpenCount: 0, deadlineExceeded: false })?.status).toBe('needs_attention');
  });
});

describe('buildAlerts', () => {
  const rec = (over: Partial<AiRecommendationEntity> = {}): AiRecommendationEntity => ({
    id: 'rec-1',
    kind: 'workload_imbalance',
    status: 'pending',
    targetUserId: null,
    title: 'Uneven load',
    message: 'Alex is carrying most of the work.',
    reason: 'One member has 80% of the estimated minutes.',
    createdAt: now.toISOString(),
    resolvedAt: null,
    ...over,
  });

  // Recommendations are DECISIONS and now have their own actionable section with
  // Review / Approve / Dismiss. Rendering them as alerts too would show the same
  // finding twice — once actionable, once not.
  it('does not turn a pending recommendation into an alert', () => {
    const alerts = buildAlerts({
      pendingRecommendations: [rec()],
      overdueOpenCount: 0,
      blockedCount: 0,
      deadlineExceeded: false,
      capacityMembers: [],
      hasOpenWork: true,
    });
    expect(alerts).toEqual([]);
  });

  it('adds a derived deadline-risk alert when overdue and no deadline recommendation exists', () => {
    const alerts = buildAlerts({
      pendingRecommendations: [],
      overdueOpenCount: 2,
      blockedCount: 0,
      deadlineExceeded: false,
      capacityMembers: [],
      hasOpenWork: true,
    });
    expect(alerts.some((a) => a.kind === 'deadline_risk' && a.link === 'plan')).toBe(true);
  });

  it('suppresses the derived deadline alert when a recommendation already covers it', () => {
    const alerts = buildAlerts({
      pendingRecommendations: [rec({ kind: 'deadline_risk' })],
      overdueOpenCount: 2,
      blockedCount: 0,
      deadlineExceeded: true,
      capacityMembers: [],
      hasOpenWork: true,
    });
    expect(alerts.filter((a) => a.kind === 'deadline_risk')).toHaveLength(0);
  });

  it('reports blocked work once, with a filter so the link lands on those items', () => {
    const alerts = buildAlerts({
      pendingRecommendations: [],
      overdueOpenCount: 0,
      blockedCount: 3,
      deadlineExceeded: false,
      capacityMembers: [],
      hasOpenWork: true,
    });
    const blocked = alerts.filter((a) => a.kind === 'blocked_work');
    expect(blocked).toHaveLength(1);
    expect(blocked[0].link).toBe('plan');
    expect(blocked[0].focus).toEqual({ blockedOnly: true });
  });

  it('adds capacity-shortage only when every contributor is busy', () => {
    const busy: MemberCapacity[] = [
      { userId: USER, displayName: 'A', band: 'busy', loadPercent: 95 },
      { userId: OTHER, displayName: 'B', band: 'busy', loadPercent: 90 },
    ];
    const alerts = buildAlerts({
      pendingRecommendations: [],
      overdueOpenCount: 0,
      blockedCount: 0,
      deadlineExceeded: false,
      capacityMembers: busy,
      hasOpenWork: true,
    });
    expect(alerts.some((a) => a.kind === 'capacity_shortage')).toBe(true);
  });
});

describe('summarizePlan & summarizeTeam — missing optional data', () => {
  it('remainingEstimatedMinutes is null when no open subtask has an estimate', () => {
    const plan = summarizePlan({
      subtasks: [sub({ estimatedDurationMinutes: null })],
      edges: [],
      deadline: null,
      capacityMembers: [],
    });
    expect(plan.remainingEstimatedMinutes).toBeNull();
    expect(plan.criticalPathSummary).toBeNull();
    expect(plan.forecastDate).toBeNull();
  });

  it('sums remaining minutes across open subtasks and counts blocked items', () => {
    const a = sub({ id: 'a', estimatedDurationMinutes: 60, actualDurationMinutes: 20 });
    const b = sub({ id: 'b', estimatedDurationMinutes: 30, actualDurationMinutes: 0 });
    const up = sub({ id: 'up', status: 'todo', isDone: false });
    const edges: SubtaskDependencyEdge[] = [{ subtaskId: 'b', dependsOnSubtaskId: 'up' }];
    const plan = summarizePlan({ subtasks: [a, b, up], edges, deadline: future, capacityMembers: [] });
    expect(plan.remainingEstimatedMinutes).toBe(40 + 30 + 60);
    expect(plan.blockedCount).toBe(1);
  });

  it('team snapshot picks the most overloaded and most available and flags balance', () => {
    const members: MemberCapacity[] = [
      { userId: USER, displayName: 'A', band: 'busy', loadPercent: 90 },
      { userId: OTHER, displayName: 'B', band: 'light', loadPercent: 20 },
    ];
    const team = summarizeTeam(members);
    expect(team.contributorCount).toBe(2);
    expect(team.mostOverloaded?.userId).toBe(USER);
    expect(team.mostAvailable?.userId).toBe(OTHER);
    expect(team.balance).toBe('uneven');
  });

  it('team snapshot is empty when there are no members', () => {
    const team = summarizeTeam([]);
    expect(team.contributorCount).toBe(0);
    expect(team.balance).toBeNull();
    expect(team.mostOverloaded).toBeNull();
  });
});

describe('countOverdueOpen', () => {
  it('counts only open, past-due items', () => {
    const subtasks = [
      sub({ id: 'a', dueDate: past }),
      sub({ id: 'b', dueDate: past, status: 'done', isDone: true }),
      sub({ id: 'c', dueDate: future }),
      sub({ id: 'd', dueDate: null }),
    ];
    expect(countOverdueOpen(subtasks, now)).toBe(1);
  });
});
