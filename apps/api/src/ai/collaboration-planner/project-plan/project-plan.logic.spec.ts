import {
  buildProjectPlan,
  type BuildProjectPlanInput,
  type RawCrossDep,
  type RawSubtask,
  type RawSubtaskEdge,
} from './project-plan.logic';

const TASK_ID = 'task-1';
const USER = 'user-1';
const OTHER = 'user-2';
const now = new Date('2026-07-25T12:00:00.000Z');

function baseInput(over: Partial<BuildProjectPlanInput> = {}): BuildProjectPlanInput {
  return {
    task: {
      id: TASK_ID,
      title: 'Group Project',
      status: 'in_progress',
      dueDate: new Date('2026-08-10T00:00:00.000Z'),
      progress: 25,
      estimatedTimeMinutes: 600,
      spentTimeMinutes: 120,
      ownerUserId: USER,
    },
    subtasks: [],
    subtaskEdges: [],
    crossDeps: [],
    nameById: new Map([
      [USER, 'Alice'],
      [OTHER, 'Bob'],
    ]),
    focusById: new Map(),
    now,
    ...over,
  };
}

function sub(over: Partial<RawSubtask> = {}): RawSubtask {
  return {
    id: 's1',
    title: 'Subtask',
    status: 'todo',
    isDone: false,
    assigneeUserId: USER,
    startDate: null,
    dueDate: new Date('2026-08-01T00:00:00.000Z'),
    estimatedDurationMinutes: 60,
    actualDurationMinutes: 0,
    ...over,
  };
}

describe('execution-item rule', () => {
  it('a parent task with NO subtasks is itself the single execution node', () => {
    const plan = buildProjectPlan(baseInput());
    expect(plan.nodes).toHaveLength(1);
    expect(plan.nodes[0]).toMatchObject({ id: TASK_ID, entityType: 'task', isGroup: false });
  });

  it('a parent task WITH subtasks uses the subtasks and never the parent as an equal work node', () => {
    const plan = buildProjectPlan(
      baseInput({ subtasks: [sub({ id: 'a', title: 'A' }), sub({ id: 'b', title: 'B' })] }),
    );
    expect(plan.nodes.map((n) => n.id).sort()).toEqual(['a', 'b']);
    expect(plan.nodes.every((n) => n.entityType === 'subtask' && n.parentTaskId === TASK_ID)).toBe(true);
    // No parent task node unless a grouping anchor is needed for cross-task edges.
    expect(plan.nodes.some((n) => n.id === TASK_ID)).toBe(false);
  });

  it('populates estimated/actual/remaining and focus summary for a subtask node', () => {
    const plan = buildProjectPlan(
      baseInput({
        subtasks: [sub({ id: 'a', estimatedDurationMinutes: 90, actualDurationMinutes: 30 })],
        focusById: new Map([['a', { sessionCount: 2, spentMinutes: 45 }]]),
      }),
    );
    const node = plan.nodes[0];
    expect(node.estimatedMinutes).toBe(90);
    expect(node.actualMinutes).toBe(30);
    expect(node.remainingMinutes).toBe(60);
    expect(node.focusSummary).toEqual({ sessionCount: 2, spentMinutes: 45 });
  });
});

describe('edges & blocked derivation', () => {
  const edges: RawSubtaskEdge[] = [{ subtaskId: 'b', dependsOnSubtaskId: 'a' }];

  it('edge direction is prerequisite -> dependent, and blockedBy/blocking mirror it', () => {
    const plan = buildProjectPlan(
      baseInput({ subtasks: [sub({ id: 'a' }), sub({ id: 'b' })], subtaskEdges: edges }),
    );
    expect(plan.edges).toEqual([
      { id: 'st:a->b', sourceId: 'a', targetId: 'b', dependencyType: 'subtask' },
    ]);
    const a = plan.nodes.find((n) => n.id === 'a')!;
    const b = plan.nodes.find((n) => n.id === 'b')!;
    expect(b.blockedByIds).toEqual(['a']);
    expect(a.blockingIds).toEqual(['b']);
  });

  it('a completed dependency does NOT block its dependent', () => {
    const plan = buildProjectPlan(
      baseInput({
        subtasks: [sub({ id: 'a', status: 'done', isDone: true }), sub({ id: 'b' })],
        subtaskEdges: edges,
      }),
    );
    expect(plan.nodes.find((n) => n.id === 'b')!.isBlocked).toBe(false);
  });

  it('an incomplete dependency blocks its dependent', () => {
    const plan = buildProjectPlan(
      baseInput({ subtasks: [sub({ id: 'a', status: 'in_progress' }), sub({ id: 'b' })], subtaskEdges: edges }),
    );
    expect(plan.nodes.find((n) => n.id === 'b')!.isBlocked).toBe(true);
  });

  it('drops and warns on self-dependencies and dangling references', () => {
    const plan = buildProjectPlan(
      baseInput({
        subtasks: [sub({ id: 'a' })],
        subtaskEdges: [
          { subtaskId: 'a', dependsOnSubtaskId: 'a' },
          { subtaskId: 'a', dependsOnSubtaskId: 'ghost' },
        ],
      }),
    );
    expect(plan.edges).toHaveLength(0);
    expect(plan.warnings.map((w) => w.code).sort()).toEqual(['dangling_dependency', 'self_dependency']);
  });
});

describe('mixed task/subtask dependencies (cross-task)', () => {
  it('adds a grouping anchor + external node and cross_task edges in both directions', () => {
    const crossDeps: RawCrossDep[] = [
      { direction: 'depends', other: { id: 'ext-up', title: 'Upstream Task', status: 'todo', ownerUserId: OTHER } },
      { direction: 'blocks', other: { id: 'ext-down', title: 'Downstream Task', status: 'todo', ownerUserId: OTHER } },
    ];
    const plan = buildProjectPlan(
      baseInput({ subtasks: [sub({ id: 'a' })], subtaskEdges: [], crossDeps }),
    );
    const anchor = plan.nodes.find((n) => n.id === TASK_ID);
    expect(anchor?.isGroup).toBe(true);
    expect(plan.nodes.some((n) => n.id === 'ext-up' && n.isExternal)).toBe(true);
    expect(plan.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceId: 'ext-up', targetId: TASK_ID, dependencyType: 'cross_task' }),
        expect.objectContaining({ sourceId: TASK_ID, targetId: 'ext-down', dependencyType: 'cross_task' }),
      ]),
    );
  });

  it('connects cross-task edges directly to a subtask-less task node', () => {
    const crossDeps: RawCrossDep[] = [
      { direction: 'depends', other: { id: 'ext', title: 'Ext', status: 'done', ownerUserId: OTHER } },
    ];
    const plan = buildProjectPlan(baseInput({ subtasks: [], crossDeps }));
    expect(plan.nodes.find((n) => n.id === TASK_ID)!.isGroup).toBe(false);
    expect(plan.edges).toEqual([
      { id: 'xt:ext->task-1', sourceId: 'ext', targetId: TASK_ID, dependencyType: 'cross_task' },
    ]);
    // A done upstream external task does not block this task.
    expect(plan.nodes.find((n) => n.id === TASK_ID)!.isBlocked).toBe(false);
  });
});

describe('missing / optional data', () => {
  it('missing assignee yields a null assignee, and missing estimate yields null remaining', () => {
    const plan = buildProjectPlan(
      baseInput({
        subtasks: [sub({ id: 'a', assigneeUserId: null, estimatedDurationMinutes: null, dueDate: null })],
      }),
    );
    const node = plan.nodes[0];
    expect(node.assignee).toBeNull();
    expect(node.remainingMinutes).toBeNull();
    expect(node.isUnscheduled).toBe(true);
    expect(node.dueDate).toBeNull();
  });
});

describe('circular dependency', () => {
  it('detects a multi-hop cycle that the DB-level validation cannot catch', () => {
    const plan = buildProjectPlan(
      baseInput({
        subtasks: [sub({ id: 'a' }), sub({ id: 'b' }), sub({ id: 'c' })],
        subtaskEdges: [
          { subtaskId: 'b', dependsOnSubtaskId: 'a' },
          { subtaskId: 'c', dependsOnSubtaskId: 'b' },
          { subtaskId: 'a', dependsOnSubtaskId: 'c' },
        ],
      }),
    );
    const cycleWarning = plan.warnings.find((w) => w.code === 'cycle');
    expect(cycleWarning).toBeTruthy();
    expect(cycleWarning!.nodeIds.sort()).toEqual(['a', 'b', 'c']);
    // Forecast is skipped for cyclic nodes (never silently invented).
    expect(plan.nodes.every((n) => n.inCycle && n.forecastStart === null)).toBe(true);
  });
});

describe('forecast (planned vs forecast)', () => {
  it('chains forecast windows across a dependency and layers them', () => {
    const plan = buildProjectPlan(
      baseInput({
        subtasks: [
          sub({ id: 'a', estimatedDurationMinutes: 60, actualDurationMinutes: 0, dueDate: null }),
          sub({ id: 'b', estimatedDurationMinutes: 30, actualDurationMinutes: 0, dueDate: null }),
        ],
        subtaskEdges: [{ subtaskId: 'b', dependsOnSubtaskId: 'a' }],
      }),
    );
    const a = plan.nodes.find((n) => n.id === 'a')!;
    const b = plan.nodes.find((n) => n.id === 'b')!;
    expect(a.layer).toBe(0);
    expect(b.layer).toBe(1);
    // b cannot start until a's forecast end.
    expect(new Date(b.forecastStart!).getTime()).toBe(new Date(a.forecastEnd!).getTime());
    expect(new Date(a.forecastStart!).getTime()).toBe(now.getTime());
  });
});

describe('empty graph', () => {
  it('a task with no subtasks and no cross-task deps still returns one node and no edges/warnings', () => {
    const plan = buildProjectPlan(baseInput());
    expect(plan.nodes).toHaveLength(1);
    expect(plan.edges).toHaveLength(0);
    expect(plan.warnings).toHaveLength(0);
    expect(plan.taskId).toBe(TASK_ID);
    expect(plan.generatedAt).toBe(now.toISOString());
  });
});

describe('Critical Path Method', () => {
  it('uses remaining duration and identifies every equal critical branch', () => {
    const plan = buildProjectPlan(baseInput({
      subtasks: [
        sub({ id: 'a', estimatedDurationMinutes: 60, actualDurationMinutes: 20 }),
        sub({ id: 'b', estimatedDurationMinutes: 40, actualDurationMinutes: 0 }),
        sub({ id: 'c', estimatedDurationMinutes: 40, actualDurationMinutes: 0 }),
      ],
      subtaskEdges: [
        { subtaskId: 'b', dependsOnSubtaskId: 'a' },
        { subtaskId: 'c', dependsOnSubtaskId: 'a' },
      ],
    }));
    expect(plan.criticalPath).toMatchObject({ status: 'available', durationMinutes: 80, itemIds: ['a', 'b', 'c'] });
    expect(plan.scheduling.a.totalFloatMinutes).toBe(0);
    expect(plan.scheduling.b.isCritical).toBe(true);
    expect(plan.scheduling.c.isCritical).toBe(true);
  });

  it('marks a shorter parallel branch as flexible', () => {
    const plan = buildProjectPlan(baseInput({
      subtasks: [sub({ id: 'a', estimatedDurationMinutes: 60 }), sub({ id: 'b', estimatedDurationMinutes: 30 })],
    }));
    expect(plan.criticalPath.status).toBe('available');
    expect(plan.scheduling.a).toMatchObject({ isCritical: true, totalFloatMinutes: 0 });
    expect(plan.scheduling.b).toMatchObject({ isCritical: false, totalFloatMinutes: 30 });
  });

  it('is unavailable for cycles and unfinished items without estimates', () => {
    const cycle = buildProjectPlan(baseInput({ subtasks: [sub({ id: 'a' }), sub({ id: 'b' })], subtaskEdges: [{ subtaskId: 'b', dependsOnSubtaskId: 'a' }, { subtaskId: 'a', dependsOnSubtaskId: 'b' }] }));
    expect(cycle.criticalPath).toMatchObject({ status: 'unavailable' });
    const missing = buildProjectPlan(baseInput({ subtasks: [sub({ id: 'a', estimatedDurationMinutes: null })] }));
    expect(missing.criticalPath).toMatchObject({ status: 'unavailable' });
  });
});

describe('Resource-Aware Forecast integration', () => {
  it('attaches a forecast, resource lanes, and per-item forecast fields to scheduling', () => {
    const plan = buildProjectPlan(
      baseInput({
        subtasks: [
          sub({ id: 'a', estimatedDurationMinutes: 60, actualDurationMinutes: 0 }),
          sub({ id: 'b', estimatedDurationMinutes: 30, actualDurationMinutes: 0 }),
        ],
        subtaskEdges: [{ subtaskId: 'b', dependsOnSubtaskId: 'a' }],
      }),
    );
    expect(plan.forecast.status).toBe('available');
    expect(plan.forecast.projectedCompletion).toBeTruthy();
    // Both subtasks belong to the same member (Alice) → they serialize.
    expect(plan.resourceLanes.map((l) => l.assigneeId)).toEqual(['user-1']);
    expect(plan.scheduling.a.forecastStatus).toBe('scheduled');
    expect(plan.scheduling.b.forecastStart).toBe(plan.scheduling.a.forecastEnd);
    expect(plan.scheduling.a.assigneeId).toBe('user-1');
  });

  it('a circular dependency makes the resource forecast unavailable too', () => {
    const plan = buildProjectPlan(
      baseInput({
        subtasks: [sub({ id: 'a' }), sub({ id: 'b' })],
        subtaskEdges: [
          { subtaskId: 'b', dependsOnSubtaskId: 'a' },
          { subtaskId: 'a', dependsOnSubtaskId: 'b' },
        ],
      }),
    );
    expect(plan.forecast.status).toBe('unavailable');
    expect(plan.resourceLanes).toEqual([]);
  });
});
