import { ProjectHealthService } from './project-health.service';
import type { ProjectPlan } from './project-plan/project-plan.logic';
import type { TeamInsights } from './team-insights.service';

const NOW = '2026-07-27T12:00:00.000Z';

function node(over: Partial<ProjectPlan['nodes'][number]> = {}): ProjectPlan['nodes'][number] {
  return {
    id: 'n',
    entityType: 'subtask',
    parentTaskId: 'task-1',
    title: 'Node',
    status: 'todo',
    assignee: { userId: 'u1', displayName: 'Alice' },
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
    nodes: [node({ id: 'a', progressPercent: 100, status: 'done' }), node({ id: 'b', remainingMinutes: 120 })],
    edges: [],
    warnings: [],
    criticalPath: { status: 'available', itemIds: ['b'], durationMinutes: 120, projectedCompletion: NOW, reason: null },
    scheduling: {
      b: { isCritical: true, forecastStatus: 'scheduled', forecastStart: '2026-07-27T09:00:00.000Z', forecastEnd: '2026-07-27T11:00:00.000Z' },
    },
    forecast: {
      status: 'available',
      generatedAt: NOW,
      projectedCompletion: '2026-07-28T12:00:00.000Z',
      deadline: '2026-08-01T12:00:00.000Z',
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

function makeTeam(over: Partial<TeamInsights> = {}): TeamInsights {
  return {
    generatedAt: NOW,
    viewerRole: 'owner',
    summary: {
      health: 'healthy',
      balancePercent: 90,
      remainingMinutes: 120,
      availableMinutes: 2400,
      capacityShortfallMinutes: 0,
      forecastCompletion: NOW,
      forecastDelay: { minutes: 0, days: 0 },
      overloadedCount: 0,
      availableCount: 1,
      blockedCriticalCount: 0,
      memberCount: 1,
      bottleneckUserId: null,
      unassigned: { itemCount: 0, remainingMinutes: 0 },
    },
    members: [
      {
        userId: 'u1',
        name: 'Alice',
        avatarUrl: null,
        role: 'owner',
        status: 'balanced',
        utilisationPercent: 25,
        remainingMinutes: 120,
        availableMinutes: 2400,
        overloadMinutes: 0,
        actualMinutes: 0,
        completedMinutes: 60,
        assignedItemCount: 2,
        completedItemCount: 1,
        readyItemCount: 1,
        blockedItemCount: 0,
        criticalItemCount: 1,
        futureItemCount: 0,
        unscheduledItemCount: 0,
        forecastDelayMinutes: 0,
        isBottleneck: false,
      },
    ],
    warnings: [],
    formulaVersion: 'team-intelligence-v2',
    ...over,
  };
}

function makeService(opts: {
  viewerRole?: 'owner' | 'editor' | 'viewer';
  plan?: ProjectPlan;
  team?: TeamInsights;
  focusRows?: { status: string; plannedMinutes: number; actualMinutes: number | null }[];
}): ProjectHealthService {
  const focusRows = opts.focusRows ?? [];
  const db = { select: () => ({ from: () => ({ where: async () => focusRows }) }) };
  const access = { require: async () => ({ role: opts.viewerRole ?? 'owner' }) };
  const projectPlan = { getProjectPlan: async () => opts.plan ?? makePlan() };
  const team = { get: async () => opts.team ?? makeTeam() };
  return new ProjectHealthService(
    { db } as never,
    access as never,
    projectPlan as never,
    team as never,
  );
}

describe('ProjectHealthService.get (assembly)', () => {
  it('assembles a full deterministic health object with the viewer role', async () => {
    const result = await makeService({ viewerRole: 'editor', focusRows: [{ status: 'completed', plannedMinutes: 25, actualMinutes: 25 }] }).get('u1', 'task-1');
    expect(result.viewerRole).toBe('editor');
    expect(result.formulaVersion).toBe('project-health-v1');
    expect(typeof result.overall.score).toBe('number');
    expect(result.schedule).toBeDefined();
    expect(result.capacity).toBeDefined();
    expect(result.dependency).toBeDefined();
    expect(result.execution).toBeDefined();
    expect(result.collaboration).toBeDefined();
    expect(result.trend.available).toBe(false);
  });

  it('every accepted role can inspect health (owner/editor/viewer)', async () => {
    for (const role of ['owner', 'editor', 'viewer'] as const) {
      const result = await makeService({ viewerRole: role }).get('u1', 'task-1');
      expect(result.viewerRole).toBe(role);
    }
  });

  it('reports no_data focus when the task has no focus sessions', async () => {
    const result = await makeService({ focusRows: [] }).get('u1', 'task-1');
    expect(result.focus.status).toBe('no_data');
  });

  it('reflects an unavailable critical path from the plan', async () => {
    const plan = makePlan({
      criticalPath: { status: 'unavailable', itemIds: [], durationMinutes: null, projectedCompletion: null, reason: 'missing estimate' },
      forecast: { ...makePlan().forecast, status: 'partial' },
    });
    const result = await makeService({ plan }).get('u1', 'task-1');
    expect(result.schedule.details.criticalPathScore).toBe(0);
    expect(result.warnings.some((w) => /unavailable/i.test(w.message))).toBe(true);
  });

  it('detects a dependency cycle from plan warnings', async () => {
    const plan = makePlan({
      warnings: [{ code: 'cycle', message: 'circular', nodeIds: ['b'] }],
      nodes: [node({ id: 'b', inCycle: true, remainingMinutes: 120 })],
    });
    const result = await makeService({ plan }).get('u1', 'task-1');
    expect(result.dependency.details.cyclePresent).toBe(true);
    expect(result.warnings.some((w) => w.group === 'Dependency')).toBe(true);
  });
});
