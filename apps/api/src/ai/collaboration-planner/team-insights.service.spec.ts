import {
  classifyItem,
  statusFor,
  teamHealthStatus,
  utilisationFor,
  workloadBalancePercent,
  TeamInsightsService,
  type TeamInsights,
} from './team-insights.service';
import type { ProjectPlan } from './project-plan/project-plan.logic';

describe('Team Intelligence pure formulas', () => {
  it.each([
    [0, 'available'],
    [39, 'available'],
    [40, 'balanced'],
    [80, 'balanced'],
    [81, 'heavy'],
    [100, 'heavy'],
    [101, 'over_capacity'],
    [999, 'over_capacity'],
  ] as const)('resolves %i%% as %s', (utilisation, status) => {
    expect(statusFor(utilisation)).toBe(status);
  });

  it('utilisation is remaining ÷ available, safe at zero capacity and zero workload', () => {
    expect(utilisationFor(240, 480)).toBe(50);
    expect(utilisationFor(600, 480)).toBe(125); // over capacity
    expect(utilisationFor(60, 0)).toBe(999); // zero capacity, has work
    expect(utilisationFor(0, 0)).toBe(0); // zero workload
    expect(utilisationFor(0, 480)).toBe(0);
  });

  it('balance measures utilisation spread, not task count, and is deterministic', () => {
    const first = workloadBalancePercent([20, 180], 100);
    expect(first).toBe(20);
    expect(workloadBalancePercent([20, 180], 100)).toBe(first);
    expect(workloadBalancePercent([], 0)).toBe(100);
    expect(workloadBalancePercent([50, 50], 50)).toBe(100); // perfectly balanced
  });

  it('team health escalates with delay, shortfall, overload, then balance', () => {
    expect(teamHealthStatus({ balancePercent: 95, capacityShortfallMinutes: 0, delayMinutes: 0, overloadedCount: 0 })).toBe('healthy');
    expect(teamHealthStatus({ balancePercent: 70, capacityShortfallMinutes: 0, delayMinutes: 0, overloadedCount: 0 })).toBe('balanced');
    expect(teamHealthStatus({ balancePercent: 40, capacityShortfallMinutes: 0, delayMinutes: 0, overloadedCount: 0 })).toBe('strained');
    expect(teamHealthStatus({ balancePercent: 95, capacityShortfallMinutes: 0, delayMinutes: 0, overloadedCount: 1 })).toBe('strained');
    expect(teamHealthStatus({ balancePercent: 95, capacityShortfallMinutes: 0, delayMinutes: 120, overloadedCount: 0 })).toBe('at_risk');
    expect(teamHealthStatus({ balancePercent: 95, capacityShortfallMinutes: 30, delayMinutes: 0, overloadedCount: 0 })).toBe('at_risk');
  });

  it('classifyItem reuses plan/forecast state without recomputing traversal', () => {
    const now = Date.parse('2026-07-27T12:00:00.000Z');
    expect(classifyItem({ isBlocked: true }, { forecastStatus: 'scheduled' }, now)).toBe('blocked');
    expect(classifyItem({ isBlocked: false }, { forecastStatus: 'unscheduled' }, now)).toBe('unscheduled');
    expect(classifyItem({ isBlocked: false }, { forecastStatus: 'in_cycle' }, now)).toBe('unscheduled');
    expect(classifyItem({ isBlocked: false }, { forecastStatus: 'scheduled', forecastStart: '2026-07-28T00:00:00.000Z' }, now)).toBe('future');
    expect(classifyItem({ isBlocked: false }, { forecastStatus: 'scheduled', forecastStart: '2026-07-27T09:00:00.000Z' }, now)).toBe('ready');
    expect(classifyItem({ isBlocked: false }, undefined, now)).toBe('ready');
  });
});

// --- Service integration over a stubbed project plan ------------------------
// The plan model (Critical Path + Resource Forecast + Resource Lanes) is unit
// tested elsewhere; here we stub it and assert the Team dashboard rolls those
// backend values up correctly for every required scenario.

const NOW = '2026-07-27T12:00:00.000Z';
const OWNER = 'owner-1';
const EDITOR = 'editor-1';

function node(over: Partial<ProjectPlan['nodes'][number]> = {}): ProjectPlan['nodes'][number] {
  return {
    id: 'n',
    entityType: 'subtask',
    parentTaskId: 'task-1',
    title: 'Node',
    status: 'todo',
    assignee: { userId: OWNER, displayName: 'Owner' },
    estimatedMinutes: 60,
    actualMinutes: 0,
    remainingMinutes: 60,
    plannedStart: null,
    plannedEnd: null,
    forecastStart: null,
    forecastEnd: null,
    dueDate: null,
    progressPercent: 0,
    isBlocked: false,
    blockedByIds: [],
    blockingIds: [],
    focusSummary: null,
    isExternal: false,
    isGroup: false,
    layer: 0,
    inCycle: false,
    isUnscheduled: false,
    ...over,
  };
}

function makePlan(over: Partial<ProjectPlan> = {}): ProjectPlan {
  return {
    taskId: 'task-1',
    generatedAt: NOW,
    nodes: [],
    edges: [],
    warnings: [],
    criticalPath: { status: 'available', itemIds: [], durationMinutes: 0, projectedCompletion: NOW, reason: null },
    scheduling: {},
    forecast: {
      status: 'available',
      generatedAt: NOW,
      projectedCompletion: NOW,
      deadline: null,
      delayMinutes: 0,
      delayDays: 0,
      capacityShortfallMinutes: 0,
      unscheduledItemIds: [],
      bottleneckAssignee: null,
      fallbackPolicy: null,
      reasons: [],
    },
    resourceLanes: [],
    ...over,
  };
}

function makeService(opts: {
  viewerRole?: 'owner' | 'editor' | 'viewer';
  members?: { userId: string; role: string; name: string; avatarUrl: string | null }[];
  ownerId?: string;
  plan: ProjectPlan;
}): TeamInsightsService {
  const ownerId = opts.ownerId ?? OWNER;
  const memberRows = opts.members ?? [{ userId: OWNER, role: 'owner', name: 'Owner', avatarUrl: null }];
  // Minimal chainable drizzle stub: select().from().innerJoin().where() → memberRows.
  const db = {
    select: () => ({
      from: () => ({
        innerJoin: () => ({ where: async () => memberRows }),
        where: async () => [{ id: ownerId, name: 'Owner', avatarUrl: null }],
      }),
    }),
  };
  const access = {
    require: async () => ({ task: { userId: ownerId }, role: opts.viewerRole ?? 'owner' }),
  };
  const projectPlan = { getProjectPlan: async () => opts.plan };
  return new TeamInsightsService(
    { db } as never,
    access as never,
    projectPlan as never,
  );
}

async function run(opts: Parameters<typeof makeService>[0]): Promise<TeamInsights> {
  return makeService(opts).get('viewer-x', 'task-1');
}

describe('TeamInsightsService.get (read-only dashboard)', () => {
  it('passes the viewer role through for owner / editor / viewer', async () => {
    for (const role of ['owner', 'editor', 'viewer'] as const) {
      const result = await run({ viewerRole: role, plan: makePlan() });
      expect(result.viewerRole).toBe(role);
    }
  });

  it('reports zero workload and zero capacity without fabricating numbers', async () => {
    const result = await run({ plan: makePlan() });
    expect(result.summary.remainingMinutes).toBe(0);
    expect(result.summary.availableMinutes).toBe(0);
    expect(result.members[0].utilisationPercent).toBe(0);
    expect(result.members[0].status).toBe('available');
  });

  it('flags an overloaded member from the resource lane capacity', async () => {
    const plan = makePlan({
      nodes: [node({ id: 'a', remainingMinutes: 600, assignee: { userId: OWNER, displayName: 'Owner' } })],
      resourceLanes: [{ assigneeId: OWNER, assigneeName: 'Owner', availableMinutes: 480, scheduledMinutes: 480, utilisationPercent: 100, overloadMinutes: 120 }],
      forecast: { ...makePlan().forecast, bottleneckAssignee: { assigneeId: OWNER, assigneeName: 'Owner', overloadMinutes: 120 } },
    });
    const result = await run({ plan });
    const owner = result.members.find((m) => m.userId === OWNER)!;
    expect(owner.status).toBe('over_capacity');
    expect(owner.utilisationPercent).toBe(125); // 600 / 480
    expect(owner.overloadMinutes).toBe(120);
    expect(owner.isBottleneck).toBe(true);
    expect(result.summary.overloadedCount).toBe(1);
    expect(result.warnings.some((w) => /over capacity/i.test(w))).toBe(true);
  });

  it('reports a balanced member (40–80% utilisation)', async () => {
    const plan = makePlan({
      nodes: [node({ id: 'a', remainingMinutes: 240 })],
      resourceLanes: [{ assigneeId: OWNER, assigneeName: 'Owner', availableMinutes: 480, scheduledMinutes: 240, utilisationPercent: 50, overloadMinutes: 0 }],
    });
    const owner = (await run({ plan })).members[0];
    expect(owner.status).toBe('balanced');
    expect(owner.utilisationPercent).toBe(50);
  });

  it('classifies blocked, critical, future and unscheduled items per member', async () => {
    const plan = makePlan({
      nodes: [
        node({ id: 'ready', remainingMinutes: 30 }),
        node({ id: 'blocked', isBlocked: true, remainingMinutes: 30 }),
        node({ id: 'future', remainingMinutes: 30 }),
        node({ id: 'unscheduled', remainingMinutes: 30 }),
        node({ id: 'critical', remainingMinutes: 30 }),
        node({ id: 'done', progressPercent: 100, status: 'done', actualMinutes: 45 }),
      ],
      scheduling: {
        ready: { forecastStatus: 'scheduled', forecastStart: '2026-07-27T09:00:00.000Z' },
        blocked: { forecastStatus: 'unscheduled' },
        future: { forecastStatus: 'scheduled', forecastStart: '2026-07-28T09:00:00.000Z' },
        unscheduled: { forecastStatus: 'unscheduled' },
        critical: { forecastStatus: 'scheduled', forecastStart: '2026-07-27T09:00:00.000Z', isCritical: true },
      },
      resourceLanes: [{ assigneeId: OWNER, assigneeName: 'Owner', availableMinutes: 480, scheduledMinutes: 120, utilisationPercent: 25, overloadMinutes: 0 }],
    });
    const owner = (await run({ plan })).members[0];
    expect(owner.readyItemCount).toBe(2); // ready + critical (critical is startable now)
    expect(owner.blockedItemCount).toBe(1);
    expect(owner.futureItemCount).toBe(1);
    expect(owner.unscheduledItemCount).toBe(1);
    expect(owner.criticalItemCount).toBe(1);
    expect(owner.completedItemCount).toBe(1);
    expect(owner.completedMinutes).toBe(45);
  });

  it('counts blocked critical items and surfaces the bottleneck in the summary', async () => {
    const plan = makePlan({
      nodes: [node({ id: 'x', isBlocked: true, remainingMinutes: 60 })],
      scheduling: { x: { isCritical: true, forecastStatus: 'unscheduled' } },
      forecast: { ...makePlan().forecast, bottleneckAssignee: { assigneeId: OWNER, assigneeName: 'Owner', overloadMinutes: 90 } },
      resourceLanes: [{ assigneeId: OWNER, assigneeName: 'Owner', availableMinutes: 480, scheduledMinutes: 60, utilisationPercent: 12, overloadMinutes: 0 }],
    });
    const result = await run({ plan });
    expect(result.summary.blockedCriticalCount).toBe(1);
    expect(result.summary.bottleneckUserId).toBe(OWNER);
  });

  it('reflects capacity shortfall and forecast delay from the forecast', async () => {
    const plan = makePlan({
      forecast: { ...makePlan().forecast, capacityShortfallMinutes: 120, delayMinutes: 1440, delayDays: 1, projectedCompletion: '2026-07-29T12:00:00.000Z', deadline: '2026-07-28T12:00:00.000Z' },
    });
    const summary = (await run({ plan })).summary;
    expect(summary.capacityShortfallMinutes).toBe(120);
    expect(summary.forecastDelay).toEqual({ minutes: 1440, days: 1 });
    expect(summary.forecastCompletion).toBe('2026-07-29T12:00:00.000Z');
    expect(summary.health).toBe('at_risk');
  });

  it('treats a member with missing availability as zero capacity and warns on missing estimates', async () => {
    const plan = makePlan({
      nodes: [node({ id: 'a', remainingMinutes: null, estimatedMinutes: null })],
      // No resource lane for the member → availableMinutes 0.
      resourceLanes: [],
    });
    const result = await run({ plan });
    const owner = result.members[0];
    expect(owner.availableMinutes).toBe(0);
    expect(result.warnings.some((w) => /without an estimate/i.test(w))).toBe(true);
  });

  it('orders members deterministically, most overloaded first', async () => {
    const members = [
      { userId: 'a', role: 'editor', name: 'Ali', avatarUrl: null },
      { userId: 'b', role: 'editor', name: 'Sara', avatarUrl: null },
      { userId: 'c', role: 'editor', name: 'Ahmed', avatarUrl: null },
    ];
    const plan = makePlan({
      ownerId: 'owner-only',
      nodes: [
        node({ id: 'a1', assignee: { userId: 'a', displayName: 'Ali' }, remainingMinutes: 100 }),
        node({ id: 'b1', assignee: { userId: 'b', displayName: 'Sara' }, remainingMinutes: 600 }),
        node({ id: 'c1', assignee: { userId: 'c', displayName: 'Ahmed' }, remainingMinutes: 300 }),
      ],
      resourceLanes: [
        { assigneeId: 'a', assigneeName: 'Ali', availableMinutes: 480, scheduledMinutes: 100, utilisationPercent: 20, overloadMinutes: 0 },
        { assigneeId: 'b', assigneeName: 'Sara', availableMinutes: 480, scheduledMinutes: 480, utilisationPercent: 100, overloadMinutes: 120 },
        { assigneeId: 'c', assigneeName: 'Ahmed', availableMinutes: 480, scheduledMinutes: 300, utilisationPercent: 63, overloadMinutes: 0 },
      ],
    });
    const first = (await run({ members, ownerId: 'owner-only', plan })).members.map((m) => m.userId);
    const second = (await run({ members, ownerId: 'owner-only', plan })).members.map((m) => m.userId);
    expect(first[0]).toBe('b'); // Sara is over capacity → first
    expect(first).toEqual(second); // stable
  });
});
