import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { RecommendationPreviewService } from './recommendation-preview.service';
import type { PreviewSnapshot } from './recommendation-preview.logic';
import { buildDeltas } from './recommendation-preview.logic';
import type { DetailedRecommendation } from './recommendation-detail.logic';
import type { TaskSimulation } from './recommendation-simulation.service';

const TASK_ID = 'task-1';
const REC_ID = 'rec-1';
const VIEWER = 'user-viewer';
const NOW = '2026-07-27T12:00:00.000Z';

function snapshot(over: { delayDays?: number; overall?: number; blockedItems?: number } = {}): PreviewSnapshot {
  return {
    forecast: {
      status: 'available',
      projectedCompletion: '2026-07-30T00:00:00.000Z',
      deadline: '2026-07-29T00:00:00.000Z',
      delayMinutes: (over.delayDays ?? 0) * 1440,
      delayDays: over.delayDays ?? 0,
      capacityShortfallMinutes: 0,
      unscheduledItemCount: 0,
      bottleneck: null,
    },
    health: {
      overallScore: over.overall ?? 70,
      overallStatus: 'balanced',
      scheduleScore: 70,
      capacityScore: 70,
      dependencyScore: 90,
      executionScore: 60,
      collaborationScore: 80,
    },
    capacity: {
      balancePercent: 80,
      overloadedCount: 0,
      availableCount: 1,
      memberCount: 2,
      remainingMinutes: 240,
      availableMinutes: 480,
      members: [],
    },
    criticalWork: {
      status: 'available',
      itemCount: 2,
      blockedCount: 0,
      durationMinutes: 120,
      projectedCompletion: NOW,
    },
    work: {
      blockedItemCount: over.blockedItems ?? 0,
      readyItemCount: 3,
      openItemCount: 3 + (over.blockedItems ?? 0),
    },
  };
}

/**
 * The preview service no longer simulates — it renders what
 * RecommendationSimulationService already produced. These tests therefore assert
 * the CONTRACT: access is enforced, the shared simulation is used verbatim, and
 * nothing recomputes.
 */
function makeService(options: {
  role?: 'owner' | 'editor' | 'viewer' | null;
  status?: string;
  changes?: { kind: 'reassign'; subtaskId: string; assigneeUserId: string }[];
  before?: PreviewSnapshot;
  after?: PreviewSnapshot;
  /** Omit the recommendation from the simulation map entirely. */
  omitSimulation?: boolean;
  resolutionLabel?: string | null;
} = {}) {
  const role = options.role === undefined ? 'viewer' : options.role;
  const status = options.status ?? 'pending';
  const changes = options.changes ?? [
    { kind: 'reassign' as const, subtaskId: 'sub-1', assigneeUserId: 'u2' },
  ];
  const before = options.before ?? snapshot({ delayDays: 3, overall: 55 });
  const after = options.after ?? snapshot({ delayDays: 1, overall: 68 });

  const access = {
    require: jest.fn(async (_userId: string, _taskId: string, minRole = 'viewer') => {
      if (!role) throw new NotFoundException('Task not found.');
      const rank = { viewer: 1, editor: 2, owner: 3 } as const;
      if (rank[role] < rank[minRole as 'viewer' | 'editor' | 'owner']) {
        throw new ForbiddenException('You do not have permission to edit this task.');
      }
      return { task: { id: TASK_ID }, role, isShared: true };
    }),
  };

  const detail = {
    id: REC_ID,
    kind: 'workload_imbalance',
    status,
    title: 'Rebalance',
    resolutionLabel: options.resolutionLabel ?? null,
    navigation: { tab: 'team', label: 'Open in Team', focus: {} },
  } as unknown as DetailedRecommendation;

  const simulation: TaskSimulation = {
    fingerprint: 'fp-1',
    generatedAt: NOW,
    baseline: before,
    byRecommendation: options.omitSimulation
      ? new Map()
      : new Map([
          [
            REC_ID,
            {
              recommendationId: REC_ID,
              changes,
              projected: after,
              deltas: buildDeltas(before, after),
            },
          ],
        ]),
    acceptedMemberIds: new Set(['u1', 'u2']),
    taskComplete: false,
    openItemsByAssignee: new Map(),
  };

  const recommendations = {
    loadForDecision: jest.fn(async () => ({ detail, changes, simulation })),
  };

  const service = new RecommendationPreviewService(access as never, recommendations as never);
  return { service, access, recommendations, simulation };
}

describe('RecommendationPreviewService — permissions', () => {
  it('lets a viewer preview: inspecting consequences is not acting', async () => {
    const { service, access } = makeService({ role: 'viewer' });
    const preview = await service.preview(VIEWER, TASK_ID, REC_ID);
    expect(preview.before).toBeDefined();
    expect(preview.after).toBeDefined();
    expect(access.require).toHaveBeenCalledWith(VIEWER, TASK_ID, 'viewer');
  });

  it.each(['editor', 'owner'] as const)('lets %s preview', async (role) => {
    const { service } = makeService({ role });
    await expect(service.preview(VIEWER, TASK_ID, REC_ID)).resolves.toBeDefined();
  });

  it('hides the task entirely from a non-member (404, never 403)', async () => {
    const { service, recommendations } = makeService({ role: null });
    await expect(service.preview(VIEWER, TASK_ID, REC_ID)).rejects.toBeInstanceOf(NotFoundException);
    expect(recommendations.loadForDecision).not.toHaveBeenCalled();
  });
});

describe('RecommendationPreviewService — single source of truth', () => {
  it('renders the shared simulation verbatim rather than recomputing it', async () => {
    const before = snapshot({ delayDays: 4, overall: 50, blockedItems: 7 });
    const after = snapshot({ delayDays: 1, overall: 72, blockedItems: 2 });
    const { service, simulation } = makeService({ before, after });

    const preview = await service.preview(VIEWER, TASK_ID, REC_ID);

    // Byte-identical to what validation and the card used.
    expect(preview.before).toBe(simulation.baseline);
    expect(preview.after).toBe(simulation.byRecommendation.get(REC_ID)!.projected);
    expect(preview.generatedAt).toBe(simulation.generatedAt);
  });

  it('reports the forecast improvement exactly as the shared deltas do', async () => {
    const { service } = makeService({
      before: snapshot({ delayDays: 4 }),
      after: snapshot({ delayDays: 1 }),
    });
    const preview = await service.preview(VIEWER, TASK_ID, REC_ID);

    const delta = preview.deltas.find((d) => d.key === 'forecastDelayDays')!;
    expect(delta.direction).toBe('better');
    expect(delta.change).toBe(-3);
    expect(preview.before.forecast.delayDays).toBe(4);
    expect(preview.after.forecast.delayDays).toBe(1);
  });

  it('reports the health improvement', async () => {
    const { service } = makeService({
      before: snapshot({ overall: 50 }),
      after: snapshot({ overall: 72 }),
    });
    const preview = await service.preview(VIEWER, TASK_ID, REC_ID);
    expect(preview.deltas.find((d) => d.key === 'healthOverall')!.change).toBe(22);
  });

  it('reports blocked-work improvement', async () => {
    const { service } = makeService({
      before: snapshot({ blockedItems: 7 }),
      after: snapshot({ blockedItems: 2 }),
    });
    const preview = await service.preview(VIEWER, TASK_ID, REC_ID);
    const delta = preview.deltas.find((d) => d.key === 'blockedItems')!;
    expect(delta.direction).toBe('better');
    expect(delta.change).toBe(-5);
  });

  it('reports a regression honestly instead of hiding it', async () => {
    const { service } = makeService({
      before: snapshot({ delayDays: 1, overall: 80 }),
      after: snapshot({ delayDays: 5, overall: 55 }),
    });
    const preview = await service.preview(VIEWER, TASK_ID, REC_ID);
    expect(preview.deltas.find((d) => d.key === 'forecastDelayDays')!.direction).toBe('worse');
    expect(preview.summary).toMatch(/worsens/);
  });

  it('returns the recommendation alongside the comparison so the UI needs one call', async () => {
    const { service } = makeService();
    const preview = await service.preview(VIEWER, TASK_ID, REC_ID);
    expect(preview.recommendation.id).toBe(REC_ID);
  });
});

describe('RecommendationPreviewService — guards', () => {
  it.each(['approved', 'dismissed', 'auto_resolved'])('refuses to preview a %s recommendation', async (status) => {
    const { service } = makeService({ status });
    await expect(service.preview(VIEWER, TASK_ID, REC_ID)).rejects.toThrow(/already resolved/i);
  });

  it('names the automatic resolution reason when there is one', async () => {
    const { service } = makeService({ status: 'auto_resolved', resolutionLabel: 'Already fixed' });
    await expect(service.preview(VIEWER, TASK_ID, REC_ID)).rejects.toThrow(/already fixed/i);
  });

  it('refuses to preview a recommendation whose work has changed away', async () => {
    const { service } = makeService({ changes: [] });
    await expect(service.preview(VIEWER, TASK_ID, REC_ID)).rejects.toThrow(/no longer be applied/i);
  });

  it('refuses when the shared simulation could not measure this recommendation', async () => {
    const { service } = makeService({ omitSimulation: true });
    await expect(service.preview(VIEWER, TASK_ID, REC_ID)).rejects.toThrow(/could not be measured/i);
  });
});
