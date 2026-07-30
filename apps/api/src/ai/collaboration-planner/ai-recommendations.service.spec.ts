import { aiRecommendations, subtasks, tasks, users } from '../../db/schema';
import {
  AiRecommendationsService,
  detectAheadOfPace,
  detectDeadlineRisk,
  detectInactiveMembers,
  detectWorkloadImbalance,
} from './ai-recommendations.service';
import { buildDeltas } from './recommendation-preview.logic';

const OWNER_ID = '11111111-1111-1111-1111-111111111111';
const MEMBER_A = '22222222-2222-2222-2222-222222222222';
const MEMBER_B = '33333333-3333-3333-3333-333333333333';
const TASK_ID = '44444444-4444-4444-4444-444444444444';

const now = new Date();
const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);
const daysFromNow = (n: number) => new Date(now.getTime() + n * 24 * 60 * 60 * 1000);

type SubtaskRow = typeof subtasks.$inferSelect;

function subtask(overrides: Record<string, unknown>): SubtaskRow {
  return {
    id: 'sub-1',
    title: 'Untitled',
    status: 'todo',
    assigneeUserId: null,
    startDate: null,
    dueDate: null,
    estimatedDurationMinutes: null,
    ...overrides,
  } as unknown as SubtaskRow;
}

describe('detectAheadOfPace', () => {
  it('never fires for a member who has no subtasks on this task at all', () => {
    const upcoming = [subtask({ id: 'b', title: 'Prepare summary', assigneeUserId: MEMBER_B, startDate: daysFromNow(2) })];
    const candidates = detectAheadOfPace([MEMBER_A], upcoming, upcoming);
    expect(candidates).toHaveLength(0);
  });

  it('does not fire for a member who still has an undone item of their own, even if not due yet', () => {
    const all = [
      subtask({ id: 'a', title: 'Review notes', status: 'todo', assigneeUserId: MEMBER_A, dueDate: daysFromNow(1), startDate: daysAgo(1) }),
      subtask({ id: 'b', title: 'Prepare summary', status: 'todo', assigneeUserId: MEMBER_B, startDate: daysFromNow(2) }),
    ];
    const candidates = detectAheadOfPace([MEMBER_A], all, all);
    expect(candidates).toHaveLength(0);
  });

  it('fires when a member has completed every item assigned to them and other work is upcoming', () => {
    const all = [
      subtask({ id: 'a', title: 'Wrap-up', status: 'done', assigneeUserId: MEMBER_A, dueDate: daysAgo(1), startDate: daysAgo(3) }),
      subtask({ id: 'b', title: 'Prepare summary', status: 'todo', assigneeUserId: MEMBER_B, startDate: daysFromNow(2) }),
    ];
    const openSubtasks = all.filter((row) => row.status !== 'done');
    const candidates = detectAheadOfPace([MEMBER_A], all, openSubtasks);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].payload.subtaskId).toBe('b');
    expect(candidates[0].dedupeKey).toBe(`ahead_of_pace:${MEMBER_A}:b`);
  });
});

describe('detectInactiveMembers', () => {
  it('flags a member with stale open work and no recent activity, reassigning to the least-busy other', () => {
    const openSubtasks = [
      subtask({ id: 'a', title: 'Solve problems', assigneeUserId: MEMBER_A, startDate: daysAgo(5) }),
    ];
    const capacityByUser = new Map([
      [MEMBER_A, { loadPercent: 50 }],
      [MEMBER_B, { loadPercent: 10 }],
    ]);
    const candidates = detectInactiveMembers(
      [MEMBER_A, MEMBER_B],
      openSubtasks,
      new Set(), // nobody has recent activity
      capacityByUser,
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0].payload).toEqual({ subtaskId: 'a', fromUserId: MEMBER_A, toUserId: MEMBER_B });
  });

  it('does not fire when the member has recent activity', () => {
    const openSubtasks = [
      subtask({ id: 'a', title: 'Solve problems', assigneeUserId: MEMBER_A, startDate: daysAgo(5) }),
    ];
    const candidates = detectInactiveMembers(
      [MEMBER_A, MEMBER_B],
      openSubtasks,
      new Set([MEMBER_A]),
      new Map([[MEMBER_B, { loadPercent: 10 }]]),
    );
    expect(candidates).toHaveLength(0);
  });
});

describe('detectWorkloadImbalance', () => {
  it('flags a large gap in remaining work between the busiest and lightest member', () => {
    const openSubtasks = [
      subtask({ id: 'a', assigneeUserId: MEMBER_A, estimatedDurationMinutes: 300, startDate: daysFromNow(1) }),
      subtask({ id: 'b', assigneeUserId: MEMBER_B, estimatedDurationMinutes: 60, startDate: daysFromNow(1) }),
    ];
    const candidates = detectWorkloadImbalance(openSubtasks, new Map());
    expect(candidates).toHaveLength(1);
    expect(candidates[0].payload.fromUserId).toBe(MEMBER_A);
    expect(candidates[0].payload.toUserId).toBe(MEMBER_B);
  });

  it('does not fire for a small, proportionate gap', () => {
    const openSubtasks = [
      subtask({ id: 'a', assigneeUserId: MEMBER_A, estimatedDurationMinutes: 90, startDate: daysFromNow(1) }),
      subtask({ id: 'b', assigneeUserId: MEMBER_B, estimatedDurationMinutes: 80, startDate: daysFromNow(1) }),
    ];
    expect(detectWorkloadImbalance(openSubtasks, new Map())).toHaveLength(0);
  });
});

describe('detectDeadlineRisk', () => {
  it('flags when remaining work outpaces the days left', () => {
    const task = { dueDate: daysFromNow(1) } as any;
    const openSubtasks = [
      subtask({ id: 'a', estimatedDurationMinutes: 600, startDate: daysFromNow(1) }),
      subtask({ id: 'b', estimatedDurationMinutes: 600, startDate: daysFromNow(2) }),
    ];
    const candidates = detectDeadlineRisk(task, openSubtasks, new Map([[MEMBER_A, { loadPercent: 0 }]]));
    expect(candidates).toHaveLength(1);
    expect(candidates[0].payload.projectedSlipDays).toBeGreaterThan(0);
  });

  it('does not fire when there is no deadline', () => {
    const task = { dueDate: null } as any;
    expect(detectDeadlineRisk(task, [subtask({ id: 'a' })], new Map())).toHaveLength(0);
  });

  it('does not fire when the pace is comfortably on track', () => {
    const task = { dueDate: daysFromNow(30) } as any;
    const openSubtasks = [subtask({ id: 'a', estimatedDurationMinutes: 60 })];
    expect(
      detectDeadlineRisk(task, openSubtasks, new Map([[MEMBER_A, { loadPercent: 0 }]])),
    ).toHaveLength(0);
  });
});

// --- Service-level dispatch (approve/dismiss), with a lightweight mock db ---

type AnyRow = Record<string, unknown>;

function makeDb(config: { recommendation: AnyRow; person?: AnyRow; subtaskRows?: AnyRow[] }) {
  const updates: { table: unknown; vals: AnyRow }[] = [];
  const chain = (rows: unknown[]) => {
    const promise = Promise.resolve(rows);
    return {
      where: () => chain(rows),
      then: promise.then.bind(promise),
      catch: promise.catch.bind(promise),
      finally: promise.finally.bind(promise),
    };
  };
  const db = {
    select: () => ({
      from: (table: unknown) => {
        if (table === aiRecommendations) return chain([config.recommendation]);
        if (table === users) return chain(config.person ? [config.person] : []);
        if (table === tasks) return chain([{ userId: OWNER_ID }]);
        if (table === subtasks) return chain(config.subtaskRows ?? []);
        return chain([]);
      },
    }),
    update: (table: unknown) => ({
      set: (vals: AnyRow) => {
        updates.push({ table, vals });
        return { where: () => Promise.resolve() };
      },
    }),
  };
  return { db, updates };
}

/** A subtask row shaped the way `toAffectedItem` expects. */
function affectedRow(over: AnyRow = {}): AnyRow {
  return {
    id: 'sub-1',
    title: 'Write the intro',
    status: 'todo',
    isDone: false,
    assigneeUserId: MEMBER_A,
    estimatedDurationMinutes: 60,
    startDate: daysAgo(1),
    dueDate: daysFromNow(3),
    ...over,
  };
}

/** A snapshot whose only interesting axis is the forecast delay. */
function previewSnapshot(delayDays: number, over: AnyRow = {}): any {
  return {
    forecast: {
      status: 'available',
      projectedCompletion: daysFromNow(3).toISOString(),
      deadline: daysFromNow(2).toISOString(),
      delayMinutes: delayDays * 1440,
      delayDays,
      capacityShortfallMinutes: 0,
      unscheduledItemCount: 0,
      bottleneck: null,
      ...(over.forecast as AnyRow),
    },
    health: {
      overallScore: 70,
      overallStatus: 'balanced',
      scheduleScore: 70,
      capacityScore: 70,
      dependencyScore: 90,
      executionScore: 60,
      collaborationScore: 80,
    },
    capacity: {
      balancePercent: 50,
      overloadedCount: 1,
      availableCount: 1,
      memberCount: 2,
      remainingMinutes: 240,
      availableMinutes: 480,
      members: [],
      ...(over.capacity as AnyRow),
    },
    criticalWork: {
      status: 'available',
      itemCount: 2,
      blockedCount: 0,
      durationMinutes: 120,
      projectedCompletion: daysFromNow(3).toISOString(),
    },
    work: { blockedItemCount: 0, readyItemCount: 3, openItemCount: 3 },
  };
}

function makeService(
  recommendation: AnyRow,
  person?: AnyRow,
  options: {
    subtaskRows?: AnyRow[];
    acceptedMemberIds?: string[];
    taskComplete?: boolean;
    openItemsByAssignee?: Map<string, number>;
    /** Baseline / projected forecast delay, driving the deltas. */
    delay?: { before: number; after: number };
    omitSimulation?: boolean;
  } = {},
) {
  const { db, updates } = makeDb({
    recommendation,
    person,
    subtaskRows: options.subtaskRows ?? [affectedRow(), affectedRow({ id: 'sub-2' })],
  });
  const databaseService = { db } as any;
  const access = { require: jest.fn().mockResolvedValue(undefined) } as any;
  const activityLog = jest.fn().mockResolvedValue(undefined);
  const activity = { log: activityLog } as any;
  const notifyCreate = jest.fn().mockResolvedValue(undefined);
  const notifications = { create: notifyCreate, createMany: jest.fn() } as any;
  const capacity = {} as any;

  const delay = options.delay ?? { before: 3, after: 1 };
  const baseline = previewSnapshot(delay.before);
  const projected = previewSnapshot(delay.after);
  const simulationInvalidate = jest.fn();
  const simulations = {
    invalidate: simulationInvalidate,
    simulate: jest.fn(async () => ({
      fingerprint: 'fp',
      generatedAt: now.toISOString(),
      baseline,
      byRecommendation: options.omitSimulation
        ? new Map()
        : new Map([
            [
              recommendation.id as string,
              {
                recommendationId: recommendation.id as string,
                changes: [],
                projected,
                deltas: buildDeltas(baseline, projected),
              },
            ],
          ]),
      acceptedMemberIds: new Set(options.acceptedMemberIds ?? [OWNER_ID, MEMBER_A, MEMBER_B]),
      taskComplete: options.taskComplete ?? false,
      openItemsByAssignee: options.openItemsByAssignee ?? new Map(),
    })),
  } as any;

  const service = new AiRecommendationsService(
    databaseService,
    access,
    activity,
    notifications,
    capacity,
    simulations,
  );
  return { service, updates, activityLog, notifyCreate, access, simulations, simulationInvalidate };
}

describe('AiRecommendationsService.approve', () => {
  it('reassigns the subtask and notifies the new assignee for inactive_member', async () => {
    const { service, updates, notifyCreate } = makeService(
      {
        id: 'rec-1',
        kind: 'inactive_member',
        status: 'pending',
        title: 'No activity',
        payload: { subtaskId: 'sub-1', fromUserId: MEMBER_A, toUserId: MEMBER_B },
      },
      { fullName: 'Sara' },
    );

    await service.approve(OWNER_ID, TASK_ID, 'rec-1');

    expect(updates.some((u) => u.table === subtasks && u.vals.assigneeUserId === MEMBER_B)).toBe(true);
    expect(updates.some((u) => u.table === aiRecommendations && u.vals.status === 'approved')).toBe(true);
    expect(notifyCreate).toHaveBeenCalledWith(
      expect.objectContaining({ userId: MEMBER_B, type: 'ai_recommendation_ready' }),
    );
  });

  it('shifts dates for ahead_of_pace without reassigning', async () => {
    const { service, updates, notifyCreate } = makeService({
      id: 'rec-2',
      kind: 'ahead_of_pace',
      status: 'pending',
      title: 'Move it up',
      payload: { subtaskId: 'sub-2', newStartDate: now.toISOString() },
    });

    await service.approve(OWNER_ID, TASK_ID, 'rec-2');

    expect(updates.some((u) => u.table === subtasks && 'startDate' in u.vals)).toBe(true);
    expect(notifyCreate).not.toHaveBeenCalled();
  });

  it('rejects approving a recommendation that is already resolved', async () => {
    const { service } = makeService({ id: 'rec-3', kind: 'ahead_of_pace', status: 'approved', title: 'x', payload: {} });
    await expect(service.approve(OWNER_ID, TASK_ID, 'rec-3')).rejects.toThrow();
  });
});

describe('AiRecommendationsService.dismiss', () => {
  it('marks the recommendation dismissed and logs activity', async () => {
    const { service, updates, activityLog } = makeService({
      id: 'rec-4',
      kind: 'workload_imbalance',
      status: 'pending',
      title: 'Rebalance',
      payload: {},
    });

    await service.dismiss(OWNER_ID, TASK_ID, 'rec-4');

    expect(updates.some((u) => u.table === aiRecommendations && u.vals.status === 'dismissed')).toBe(true);
    expect(activityLog).toHaveBeenCalledWith(
      OWNER_ID,
      TASK_ID,
      'ai_recommendation_dismissed',
      'Rebalance',
      expect.anything(),
    );
  });
});

// --- Validation at the point of approval -----------------------------------
// A card can go stale between render and click. Approving must then fail
// loudly and self-resolve rather than write a change that no longer helps.

describe('AiRecommendationsService.approve — re-validates before writing', () => {
  const inactiveRec = (over: AnyRow = {}) => ({
    id: 'rec-v',
    kind: 'inactive_member',
    status: 'pending',
    title: 'No activity',
    targetUserId: MEMBER_A,
    createdAt: now,
    payload: { subtaskId: 'sub-1', fromUserId: MEMBER_A, toUserId: MEMBER_B },
    ...over,
  });

  it('refuses when the target subtask has since been completed', async () => {
    const { service, updates } = makeService(inactiveRec(), { fullName: 'Sara' }, {
      subtaskRows: [affectedRow({ status: 'done', isDone: true })],
    });

    await expect(service.approve(OWNER_ID, TASK_ID, 'rec-v')).rejects.toThrow(/already complete/i);
    // Nothing was written to the work itself...
    expect(updates.some((u) => u.table === subtasks)).toBe(false);
    // ...and the card resolved itself with a durable reason.
    expect(
      updates.some(
        (u) =>
          u.table === aiRecommendations &&
          u.vals.status === 'auto_resolved' &&
          u.vals.resolutionReason === 'completed',
      ),
    ).toBe(true);
  });

  it('refuses when the receiving member has left the collaboration', async () => {
    const { service, updates } = makeService(inactiveRec(), { fullName: 'Sara' }, {
      acceptedMemberIds: [OWNER_ID, MEMBER_A],
    });

    await expect(service.approve(OWNER_ID, TASK_ID, 'rec-v')).rejects.toThrow(/no longer applicable/i);
    expect(updates.some((u) => u.table === subtasks)).toBe(false);
    expect(
      updates.some((u) => u.table === aiRecommendations && u.vals.resolutionReason === 'not_applicable'),
    ).toBe(true);
  });

  it('refuses when the work is already assigned to the proposed member', async () => {
    const { service, updates } = makeService(inactiveRec(), { fullName: 'Sara' }, {
      subtaskRows: [affectedRow({ assigneeUserId: MEMBER_B })],
    });

    await expect(service.approve(OWNER_ID, TASK_ID, 'rec-v')).rejects.toThrow(/already fixed/i);
    expect(updates.some((u) => u.table === subtasks)).toBe(false);
    expect(
      updates.some((u) => u.table === aiRecommendations && u.vals.resolutionReason === 'already_applied'),
    ).toBe(true);
  });

  it('refuses when the change would no longer move any tracked metric', async () => {
    const { service, updates } = makeService(inactiveRec(), { fullName: 'Sara' }, {
      delay: { before: 2, after: 2 },
    });

    await expect(service.approve(OWNER_ID, TASK_ID, 'rec-v')).rejects.toThrow(/no measurable effect/i);
    expect(updates.some((u) => u.table === subtasks)).toBe(false);
    expect(
      updates.some((u) => u.table === aiRecommendations && u.vals.resolutionReason === 'no_impact'),
    ).toBe(true);
  });

  it('refuses when the work it referred to was deleted', async () => {
    const { service, updates } = makeService(inactiveRec(), { fullName: 'Sara' }, { subtaskRows: [] });

    await expect(service.approve(OWNER_ID, TASK_ID, 'rec-v')).rejects.toThrow(/no longer applicable/i);
    expect(updates.some((u) => u.table === subtasks)).toBe(false);
  });

  it('refuses when the project itself is already complete', async () => {
    const { service } = makeService(inactiveRec(), { fullName: 'Sara' }, { taskComplete: true });
    await expect(service.approve(OWNER_ID, TASK_ID, 'rec-v')).rejects.toThrow(/completed automatically/i);
  });

  it('applies normally when every rule still passes', async () => {
    const { service, updates, notifyCreate } = makeService(inactiveRec(), { fullName: 'Sara' });

    await service.approve(OWNER_ID, TASK_ID, 'rec-v');

    expect(updates.some((u) => u.table === subtasks && u.vals.assigneeUserId === MEMBER_B)).toBe(true);
    expect(updates.some((u) => u.table === aiRecommendations && u.vals.status === 'approved')).toBe(true);
    expect(notifyCreate).toHaveBeenCalled();
  });

  it('drops the cached simulation after a successful apply', async () => {
    const { service, simulationInvalidate } = makeService(inactiveRec(), { fullName: 'Sara' });
    await service.approve(OWNER_ID, TASK_ID, 'rec-v');
    expect(simulationInvalidate).toHaveBeenCalledWith(TASK_ID);
  });

  it('uses the SAME simulation the card and preview used', async () => {
    const { service, simulations } = makeService(inactiveRec(), { fullName: 'Sara' });
    await service.approve(OWNER_ID, TASK_ID, 'rec-v');

    // One shared simulation call, keyed to this recommendation — not a private
    // recomputation that could disagree with what the user was shown.
    expect(simulations.simulate).toHaveBeenCalledWith(
      OWNER_ID,
      TASK_ID,
      expect.arrayContaining([expect.objectContaining({ id: 'rec-v' })]),
    );
  });
});

describe('AiRecommendationsService.dismiss — always permitted', () => {
  // Dismissal is a user judgement, not a claim about project state, so it must
  // work even for a recommendation validation would reject.
  it('dismisses a recommendation whose target is already complete', async () => {
    const { service, updates } = makeService(
      {
        id: 'rec-d',
        kind: 'inactive_member',
        status: 'pending',
        title: 'Stale',
        payload: { subtaskId: 'sub-1', toUserId: MEMBER_B },
      },
      undefined,
      { subtaskRows: [affectedRow({ status: 'done', isDone: true })] },
    );

    await service.dismiss(OWNER_ID, TASK_ID, 'rec-d');
    expect(updates.some((u) => u.table === aiRecommendations && u.vals.status === 'dismissed')).toBe(true);
  });
});
