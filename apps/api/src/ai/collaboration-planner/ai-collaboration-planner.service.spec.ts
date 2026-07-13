import { ConfigService } from '@nestjs/config';

// The service only uses eq/and/inArray from drizzle-orm to build WHERE
// conditions for the fake DB below to evaluate. Replacing them with plain
// tagged objects lets the fake DB interpret conditions generically (by
// resolving each condition's column back to a row key via column identity)
// instead of parsing real drizzle-orm SQL internals, which would be fragile
// across drizzle-orm versions.
jest.mock('drizzle-orm', () => ({
  eq: (col: unknown, val: unknown) => ({ kind: 'eq', col, val }),
  and: (...conds: unknown[]) => ({ kind: 'and', conds }),
  inArray: (col: unknown, vals: unknown[]) => ({ kind: 'inArray', col, vals }),
}));

import { AiCollaborationPlannerService } from './ai-collaboration-planner.service';
import { tasks, subtasks, subtaskDependencies, taskMembers, users } from '../../db/schema';
import type {
  CollaborationPlanItem,
  CollaborationPlanProposal,
  EligibleMember,
} from './collaboration-plan.types';
import type { CollaborationPlanPreferences } from './prompts/collaboration-plan.prompt';
import type { ApplyCollaborationPlanDto } from './dto/collaboration-plan.dto';

function planItem(
  proposalId: string,
  dependsOnProposalIds: string[],
): CollaborationPlanItem {
  return {
    proposalId,
    title: proposalId,
    description: '',
    assigneeUserId: 'a',
    assigneeDisplayName: 'A',
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
    activityType: 'production',
    sharedSessionId: null,
  };
}

describe('AiCollaborationPlannerService final response', () => {
  it('serializes the sanitized graph used by the scheduler, not stale model dependencies', () => {
    const service = new AiCollaborationPlannerService(
      { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const proposal: CollaborationPlanProposal = {
      planId: 'plan',
      generatedAt: new Date(0).toISOString(),
      source: 'ai',
      taskCollaborationType: 'divisible',
      recoveryMode: false,
      summary: '',
      items: [
        planItem('first', ['first', 'missing']),
        planItem('second', ['first']),
      ],
      workloadByMember: [],
      totalEstimatedMinutes: 60,
      deadlineFeasible: true,
      risks: [],
      unassignedWork: [],
      reviewMilestone: null,
      suggestedBufferMinutes: null,
      warnings: [],
      assumptions: [],
    };
    const preferences: CollaborationPlanPreferences = {
      workloadDistribution: 'role',
      includeOwner: true,
      maxWorkloadItemsPerPerson: null,
      allowParallelWork: true,
      addReviewSteps: false,
      addBufferTime: false,
      taskGranularity: 'medium',
      notes: null,
    };
    const members = new Map<string, EligibleMember>([
      ['a', { userId: 'a', displayName: 'A' }],
    ]);
    const finalizePlan = (
      service as unknown as {
        finalizePlan: (
          requestId: string,
          input: CollaborationPlanProposal,
          task: { dueDate: Date | null },
          prefs: CollaborationPlanPreferences,
          recoveryMode: boolean,
          assignable: Map<string, EligibleMember>,
          now: Date,
        ) => CollaborationPlanProposal;
      }
    ).finalizePlan.bind(service);

    const response = finalizePlan(
      'request',
      proposal,
      { dueDate: null },
      preferences,
      false,
      members,
      new Date('2026-01-01T09:00:00Z'),
    );

    expect(
      response.items.map(({ proposalId, dependsOnProposalIds }) => ({
        proposalId,
        dependsOnProposalIds,
      })),
    ).toEqual([
      { proposalId: 'first', dependsOnProposalIds: [] },
      { proposalId: 'second', dependsOnProposalIds: ['first'] },
    ]);
    expect(response.items[1].suggestedStart).toBe(
      response.items[0].suggestedDue,
    );
  });
});

// --- apply() -----------------------------------------------------------------

type Row = Record<string, unknown>;
type FakeState = {
  tasks: Row[];
  subtasks: Row[];
  subtaskDependencies: Row[];
  taskMembers: Row[];
  users: Row[];
};

function columnKeyMap(table: Record<string, unknown>): Map<unknown, string> {
  const map = new Map<unknown, string>();
  for (const [key, col] of Object.entries(table)) map.set(col, key);
  return map;
}

const TABLES = [tasks, subtasks, subtaskDependencies, taskMembers, users] as const;
const COLUMN_MAPS = new Map(TABLES.map((table) => [table, columnKeyMap(table)]));

function tableArray(state: FakeState, table: unknown): Row[] {
  if (table === tasks) return state.tasks;
  if (table === subtasks) return state.subtasks;
  if (table === subtaskDependencies) return state.subtaskDependencies;
  if (table === taskMembers) return state.taskMembers;
  if (table === users) return state.users;
  throw new Error('buildFakeDb: unknown table');
}

function setTableArray(state: FakeState, table: unknown, rows: Row[]) {
  if (table === tasks) state.tasks = rows;
  else if (table === subtasks) state.subtasks = rows;
  else if (table === subtaskDependencies) state.subtaskDependencies = rows;
  else if (table === taskMembers) state.taskMembers = rows;
  else if (table === users) state.users = rows;
  else throw new Error('buildFakeDb: unknown table');
}

function evalCond(
  cond: unknown,
  row: Row,
  colMap: Map<unknown, string>,
): boolean {
  if (!cond) return true;
  const c = cond as { kind: string; col?: unknown; val?: unknown; vals?: unknown[]; conds?: unknown[] };
  if (c.kind === 'eq') return row[colMap.get(c.col)!] === c.val;
  if (c.kind === 'inArray')
    return (c.vals ?? []).includes(row[colMap.get(c.col)!]);
  if (c.kind === 'and')
    return (c.conds ?? []).every((inner) => evalCond(inner, row, colMap));
  return true;
}

/**
 * Minimal in-memory drizzle double: enough surface for apply(),
 * recalculateProgress(), getUserOrThrow() and loadProfiles() to run for
 * real, including transactional insert/delete with rollback-on-throw. Insert
 * a subtask with title '__FAIL__' to force a mid-transaction failure.
 */
function buildFakeDb(state: FakeState) {
  let idCounter = 0;

  function select() {
    return {
      from(table: unknown) {
        return {
          where(cond?: unknown) {
            const colMap = COLUMN_MAPS.get(table as never)!;
            return Promise.resolve(
              tableArray(state, table).filter((row) =>
                evalCond(cond, row, colMap),
              ),
            );
          },
        };
      },
    };
  }

  function update(table: unknown) {
    return {
      set(patch: Row) {
        return {
          where(cond?: unknown) {
            const colMap = COLUMN_MAPS.get(table as never)!;
            for (const row of tableArray(state, table)) {
              if (evalCond(cond, row, colMap)) Object.assign(row, patch);
            }
            return Promise.resolve();
          },
        };
      },
    };
  }

  function insert(table: unknown) {
    return {
      values(rowsIn: Row | Row[]) {
        const list = Array.isArray(rowsIn) ? rowsIn : [rowsIn];
        const inserted = list.map((r) => {
          if (table === subtasks && r.title === '__FAIL__') {
            throw new Error('simulated insert failure');
          }
          const withDefaults =
            table === subtasks
              ? {
                  id: `sub-${(idCounter += 1)}`,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                  ...r,
                }
              : { ...r };
          tableArray(state, table).push(withDefaults);
          return withDefaults;
        });
        return { returning: () => Promise.resolve(inserted) };
      },
    };
  }

  function del(table: unknown) {
    return {
      where(cond?: unknown) {
        const colMap = COLUMN_MAPS.get(table as never)!;
        const remaining = tableArray(state, table).filter(
          (row) => !evalCond(cond, row, colMap),
        );
        setTableArray(state, table, remaining);
        return Promise.resolve();
      },
    };
  }

  async function transaction(cb: (tx: unknown) => Promise<void>) {
    const snapshot: FakeState = {
      tasks: [...state.tasks],
      subtasks: [...state.subtasks],
      subtaskDependencies: [...state.subtaskDependencies],
      taskMembers: [...state.taskMembers],
      users: [...state.users],
    };
    try {
      await cb({ select, insert, update, delete: del });
    } catch (err) {
      state.tasks = snapshot.tasks;
      state.subtasks = snapshot.subtasks;
      state.subtaskDependencies = snapshot.subtaskDependencies;
      state.taskMembers = snapshot.taskMembers;
      state.users = snapshot.users;
      throw err;
    }
  }

  return { select, insert, update, delete: del, transaction };
}

const TASK_ID = 'task-1';
const OWNER_ID = 'owner-1';
const COLLAB_ID = 'collab-1';

function buildService(state: FakeState) {
  const fakeDb = buildFakeDb(state);
  return new AiCollaborationPlannerService(
    { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService,
    { db: fakeDb } as never,
    {
      require: jest.fn().mockResolvedValue({
        task: { id: TASK_ID, userId: OWNER_ID, title: 'Exam prep' },
        role: 'owner',
      }),
    } as never,
    { log: jest.fn().mockResolvedValue(undefined) } as never,
    { createMany: jest.fn().mockResolvedValue(undefined) } as never,
  );
}

function baseState(overrides: Partial<FakeState> = {}): FakeState {
  return {
    tasks: [{ id: TASK_ID, userId: OWNER_ID, title: 'Exam prep', status: 'todo' }],
    subtasks: [],
    subtaskDependencies: [],
    taskMembers: [
      { taskId: TASK_ID, userId: COLLAB_ID, role: 'editor', status: 'accepted' },
    ],
    users: [
      { id: OWNER_ID, fullName: 'Owner' },
      { id: COLLAB_ID, fullName: 'Hadeel' },
    ],
    ...overrides,
  };
}

function applyDto(
  planId: string,
  items: Partial<ApplyCollaborationPlanDto['items'][number]>[],
): ApplyCollaborationPlanDto {
  return {
    planId,
    items: items.map((item, index) => ({
      proposalId: `p${index + 1}`,
      title: `Item ${index + 1}`,
      dependsOnProposalIds: [],
      ...item,
    })) as ApplyCollaborationPlanDto['items'],
  };
}

describe('AiCollaborationPlannerService.apply', () => {
  it('applies a plan to a task with no existing subtasks', async () => {
    const state = baseState();
    const service = buildService(state);

    const result = await service.apply(
      OWNER_ID,
      TASK_ID,
      applyDto('plan-1', [
        {
          proposalId: 'p1',
          title: 'hadeel: study Subject 1',
          assigneeUserId: COLLAB_ID,
          activityType: 'study_review',
        },
        {
          proposalId: 'p2',
          title: 'hadeel: practice Subject 1',
          assigneeUserId: COLLAB_ID,
          activityType: 'practice',
        },
      ]),
    );

    expect(result.created.subtaskIds).toHaveLength(2);
    expect(state.subtasks).toHaveLength(2);
    expect(state.subtasks.every((row) => row.source === 'ai-collaboration-planner')).toBe(true);
    expect(state.subtasks.every((row) => row.sourcePlanId === 'plan-1')).toBe(true);
  });

  it('regenerating and re-applying replaces the prior planner set while leaving a manual subtask untouched', async () => {
    const state = baseState({
      subtasks: [
        {
          id: 'manual-1',
          taskId: TASK_ID,
          title: 'Buy notebooks',
          source: null,
          isDone: false,
        },
        {
          id: 'old-ai-1',
          taskId: TASK_ID,
          title: 'Full timed practice test (mixed subjects)',
          source: 'ai-collaboration-planner',
          isDone: false,
        },
        {
          id: 'old-ai-2',
          taskId: TASK_ID,
          title: 'Error analysis & final revision',
          source: 'ai-collaboration-planner',
          isDone: false,
        },
      ],
    });
    const service = buildService(state);

    const result = await service.apply(
      OWNER_ID,
      TASK_ID,
      applyDto('plan-2', [
        {
          proposalId: 'p1',
          title: 'hadeel: full-scope practice test',
          assigneeUserId: COLLAB_ID,
          activityType: 'practice',
        },
        {
          proposalId: 'p2',
          title: 'hadeel: analyze mistakes and revise weak areas',
          assigneeUserId: COLLAB_ID,
          activityType: 'error_analysis',
        },
      ]),
    );

    expect(result.created.subtaskIds).toHaveLength(2);
    const titles = state.subtasks.map((row) => row.title).sort();
    // The submitted "hadeel:" prefixes are stripped — assignment is structural.
    expect(titles).toEqual(
      [
        'Buy notebooks',
        'analyze mistakes and revise weak areas',
        'full-scope practice test',
      ].sort(),
    );
    expect(state.subtasks.find((row) => row.id === 'manual-1')).toBeTruthy();
    expect(state.subtasks.some((row) => row.id === 'old-ai-1')).toBe(false);
    expect(state.subtasks.some((row) => row.id === 'old-ai-2')).toBe(false);
  });

  it('reopening task details shows exactly the final persisted set (new items + preserved manual, no stale AI rows)', async () => {
    const state = baseState({
      subtasks: [
        { id: 'manual-1', taskId: TASK_ID, title: 'Buy notebooks', source: null, isDone: false },
        { id: 'old-ai-1', taskId: TASK_ID, title: 'Old AI item', source: 'ai-collaboration-planner', isDone: false },
      ],
    });
    const service = buildService(state);

    await service.apply(
      OWNER_ID,
      TASK_ID,
      applyDto('plan-3', [
        {
          proposalId: 'p1',
          title: 'New AI item A',
          assigneeUserId: COLLAB_ID,
          activityType: 'preparation',
        },
        {
          proposalId: 'p2',
          title: 'New AI item B',
          assigneeUserId: COLLAB_ID,
          activityType: 'production',
        },
      ]),
    );

    // Simulate re-reading the task (Task Details screen reopening).
    const reread = state.subtasks.map((row) => row.title).sort();
    expect(reread).toEqual(
      ['Buy notebooks', 'New AI item A', 'New AI item B'].sort(),
    );
  });

  it('rolls back and leaves the previous plan unchanged when the transaction fails partway through', async () => {
    const state = baseState({
      subtasks: [
        { id: 'old-ai-1', taskId: TASK_ID, title: 'Old AI item', source: 'ai-collaboration-planner', isDone: false },
      ],
    });
    const service = buildService(state);
    const beforeSnapshot = JSON.stringify(state.subtasks);

    await expect(
      service.apply(
        OWNER_ID,
        TASK_ID,
        applyDto('plan-4', [
          {
            proposalId: 'p1',
            title: 'Good item',
            assigneeUserId: COLLAB_ID,
            activityType: 'preparation',
          },
          {
            proposalId: 'p2',
            title: '__FAIL__',
            assigneeUserId: COLLAB_ID,
            activityType: 'production',
          },
        ]),
      ),
    ).rejects.toThrow('simulated insert failure');

    expect(JSON.stringify(state.subtasks)).toBe(beforeSnapshot);
    expect(state.subtasks).toHaveLength(1);
    expect(state.subtasks[0].id).toBe('old-ai-1');
  });

  it('persists a shared session as ONE shared subtask and strips participant names from titles', async () => {
    const state = baseState();
    const service = buildService(state);

    await service.apply(
      OWNER_ID,
      TASK_ID,
      applyDto('plan-5', [
        {
          proposalId: 'p1',
          title: 'Hadeel: Study Subject 1',
          assigneeUserId: COLLAB_ID,
          activityType: 'study_review',
        },
        {
          proposalId: 'p2',
          title: 'Shared timed mock exam',
          assigneeUserId: OWNER_ID,
          activityType: 'shared_session',
          sharedSessionId: 'sess-1',
        },
        {
          proposalId: 'p3',
          title: 'Shared timed mock exam',
          assigneeUserId: COLLAB_ID,
          activityType: 'shared_session',
          sharedSessionId: 'sess-1',
        },
      ]),
    );

    const shared = state.subtasks.filter((row) => row.isShared);
    expect(shared).toHaveLength(1);
    expect(shared[0].assigneeUserId).toBeNull();
    expect(shared[0].title).toBe('Shared timed mock exam');

    // No persisted title contains a participant name (prefix stripped).
    expect(
      state.subtasks.every(
        (row) => !/hadeel/i.test(String(row.title).split(':')[0]),
      ),
    ).toBe(true);
    const study = state.subtasks.find((row) => !row.isShared);
    expect(study?.title).toBe('Study Subject 1');
  });
});
