import { subtasks, taskMembers, tasks, users } from '../../db/schema';
import { DEFAULT_PLANNER_PREFERENCES } from '../planner/planner-preferences.service';
import { WorkloadCapacityService } from './workload-capacity.service';

const OWNER_ID = '11111111-1111-1111-1111-111111111111';
const LIGHT_USER = '22222222-2222-2222-2222-222222222222';
const BUSY_USER = '33333333-3333-3333-3333-333333333333';
const TASK_ID = '44444444-4444-4444-4444-444444444444';

type AnyRow = Record<string, unknown>;

function chain(rows: unknown[]) {
  const promise = Promise.resolve(rows);
  return {
    where: () => chain(rows),
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally.bind(promise),
  };
}

function makeDb(config: {
  usersList: AnyRow[];
  tasksList: AnyRow[];
  membersList: AnyRow[];
  subtasksList: AnyRow[];
}) {
  const db = {
    select: () => ({
      from: (table: unknown) => {
        if (table === users) return chain(config.usersList);
        if (table === tasks) return chain(config.tasksList);
        if (table === taskMembers) return chain(config.membersList);
        if (table === subtasks) return chain(config.subtasksList);
        return chain([]);
      },
    }),
  };
  return db;
}

function makeService(config: Parameters<typeof makeDb>[0]) {
  const databaseService = { db: makeDb(config) } as any;
  const plannerPreferences = {
    getPreferences: async () => ({ ...DEFAULT_PLANNER_PREFERENCES }),
  } as any;
  return new WorkloadCapacityService(databaseService, plannerPreferences);
}

describe('WorkloadCapacityService', () => {
  it('bands a member with little open work as light', async () => {
    const service = makeService({
      usersList: [{ id: LIGHT_USER, fullName: 'Sara' }],
      tasksList: [],
      membersList: [],
      subtasksList: [
        { assigneeUserId: LIGHT_USER, estimatedDurationMinutes: 60 },
      ],
    });

    const [result] = await service.getCapacityForUsers([LIGHT_USER]);
    expect(result.band).toBe('light');
    expect(result.loadPercent).toBeLessThan(40);
  });

  it('bands a member with heavy open work as busy', async () => {
    const service = makeService({
      usersList: [{ id: BUSY_USER, fullName: 'Ali' }],
      tasksList: [],
      membersList: [],
      subtasksList: [
        { assigneeUserId: BUSY_USER, estimatedDurationMinutes: 2000 },
        { assigneeUserId: BUSY_USER, estimatedDurationMinutes: 1500 },
      ],
    });

    const [result] = await service.getCapacityForUsers([BUSY_USER]);
    expect(result.band).toBe('busy');
    expect(result.loadPercent).toBeGreaterThan(75);
  });

  it('falls back to a default estimate for subtasks with no duration set', async () => {
    const service = makeService({
      usersList: [{ id: LIGHT_USER, fullName: 'Sara' }],
      tasksList: [],
      membersList: [],
      subtasksList: [{ assigneeUserId: LIGHT_USER, estimatedDurationMinutes: null }],
    });

    const [result] = await service.getCapacityForUsers([LIGHT_USER]);
    expect(result.loadPercent).toBeGreaterThan(0);
  });

  it('never returns task content — only userId, displayName, band, loadPercent', async () => {
    const service = makeService({
      usersList: [{ id: LIGHT_USER, fullName: 'Sara' }],
      tasksList: [],
      membersList: [],
      subtasksList: [],
    });

    const [result] = await service.getCapacityForUsers([LIGHT_USER]);
    expect(Object.keys(result).sort()).toEqual(
      ['band', 'displayName', 'loadPercent', 'userId'].sort(),
    );
  });

  it('resolves accepted members (owner + accepted invites) for a task', async () => {
    const service = makeService({
      usersList: [
        { id: OWNER_ID, fullName: 'Owner' },
        { id: LIGHT_USER, fullName: 'Sara' },
      ],
      tasksList: [{ userId: OWNER_ID }],
      membersList: [
        { userId: LIGHT_USER, status: 'accepted' },
        { userId: BUSY_USER, status: 'pending' },
      ],
      subtasksList: [],
    });

    const bands = await service.getCapacityBands(TASK_ID);
    const ids = bands.map((band) => band.userId).sort();
    expect(ids).toEqual([LIGHT_USER, OWNER_ID].sort());
  });
});
