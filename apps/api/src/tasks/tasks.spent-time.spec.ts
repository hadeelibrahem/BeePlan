import { TaskAccessService } from '../collaboration/task-access.service';
import { DatabaseService } from '../db/database.service';
import { focusSessions, tasks } from '../db/schema';
import { NotificationsService } from '../notifications/notifications.service';
import { TasksService } from './tasks.service';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const TASK_ID = '22222222-2222-2222-2222-222222222222';

type AnyRow = Record<string, unknown>;

/** Thenable that also exposes the drizzle chain methods used by the service. */
function chain(rows: unknown[]) {
  const promise = Promise.resolve(rows);
  return {
    where: () => chain(rows),
    limit: () => chain(rows),
    orderBy: () => chain(rows),
    returning: () => Promise.resolve(rows),
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally.bind(promise),
  };
}

type DbConfig = { taskRows?: AnyRow[]; focusRows?: AnyRow[] };

function makeDb(config: DbConfig) {
  const inserts: { table: unknown; vals: AnyRow }[] = [];
  const updates: { table: unknown; vals: AnyRow }[] = [];

  const rowsFor = (table: unknown): unknown[] => {
    if (table === tasks) return config.taskRows ?? [];
    if (table === focusSessions) return config.focusRows ?? [];
    return [];
  };

  const db = {
    select: (_cols?: unknown) => ({
      from: (table: unknown) => chain(rowsFor(table)),
    }),
    insert: (table: unknown) => ({
      values: (vals: AnyRow) => {
        inserts.push({ table, vals });
        return chain([{ id: TASK_ID, ...vals }]);
      },
    }),
    update: (table: unknown) => ({
      set: (vals: AnyRow) => {
        updates.push({ table, vals });
        return { where: () => Promise.resolve(undefined) };
      },
    }),
  };

  return { db, inserts, updates };
}

function buildService(config: DbConfig) {
  const { db, inserts, updates } = makeDb(config);
  const service = new TasksService(
    { db } as unknown as DatabaseService,
    {
      require: jest
        .fn()
        .mockResolvedValue({ role: 'owner', isShared: false }),
      getRecipientIds: jest.fn().mockResolvedValue([USER_ID]),
    } as unknown as TaskAccessService,
    { create: jest.fn(), createMany: jest.fn() } as unknown as NotificationsService,
  );
  return { service, inserts, updates };
}

const spentUpdate = (updates: { table: unknown; vals: AnyRow }[]) =>
  updates.find((u) => u.table === tasks && u.vals.spentTimeMinutes !== undefined)
    ?.vals;

describe('TasksService.recomputeTaskSpentTime', () => {
  it('derives spent = manual + completed focus, and remaining = estimate - spent', async () => {
    const { service, updates } = buildService({
      taskRows: [{ manualSpentMinutes: 60, estimatedTimeMinutes: 120 }],
      focusRows: [
        { actualMinutes: 25, status: 'completed' },
        { actualMinutes: 15, status: 'completed' },
      ],
    });

    await service.recomputeTaskSpentTime(TASK_ID);

    const vals = spentUpdate(updates);
    expect(vals?.spentTimeMinutes).toBe(100); // 60 manual + 40 focus
    expect(vals?.remainingTimeMinutes).toBe(20); // 120 - 100
  });

  it('excludes cancelled and active focus sessions from the focus sum', async () => {
    const { service, updates } = buildService({
      taskRows: [{ manualSpentMinutes: 60, estimatedTimeMinutes: 500 }],
      focusRows: [
        { actualMinutes: 15, status: 'completed' },
        { actualMinutes: 999, status: 'cancelled' },
        { actualMinutes: 888, status: 'active' },
      ],
    });

    await service.recomputeTaskSpentTime(TASK_ID);

    expect(spentUpdate(updates)?.spentTimeMinutes).toBe(75); // 60 + 15 only
  });

  it('preserves manual time when there are no focus sessions', async () => {
    const { service, updates } = buildService({
      taskRows: [{ manualSpentMinutes: 45, estimatedTimeMinutes: 60 }],
      focusRows: [],
    });

    await service.recomputeTaskSpentTime(TASK_ID);

    const vals = spentUpdate(updates);
    expect(vals?.spentTimeMinutes).toBe(45);
    expect(vals?.remainingTimeMinutes).toBe(15);
  });

  it('counts focus time when there is no manual time', async () => {
    const { service, updates } = buildService({
      taskRows: [{ manualSpentMinutes: 0, estimatedTimeMinutes: 60 }],
      focusRows: [{ actualMinutes: 30, status: 'completed' }],
    });

    await service.recomputeTaskSpentTime(TASK_ID);

    expect(spentUpdate(updates)?.spentTimeMinutes).toBe(30);
  });

  it('floors remaining at zero when spent exceeds the estimate', async () => {
    const { service, updates } = buildService({
      taskRows: [{ manualSpentMinutes: 200, estimatedTimeMinutes: 60 }],
      focusRows: [],
    });

    await service.recomputeTaskSpentTime(TASK_ID);

    const vals = spentUpdate(updates);
    expect(vals?.spentTimeMinutes).toBe(200);
    expect(vals?.remainingTimeMinutes).toBe(0);
  });
});

describe('Manual spent-time write paths route to manualSpentMinutes', () => {
  it('create stores the submitted spent time as the manual portion', async () => {
    const { service, inserts } = buildService({});
    jest.spyOn(service as never, 'recalculateProgress').mockResolvedValue(undefined as never);
    jest.spyOn(service as never, 'addActivity').mockResolvedValue(undefined as never);
    jest.spyOn(service as never, 'findOne').mockResolvedValue({} as never);

    await service.create(USER_ID, {
      title: 'Write report',
      estimatedTimeMinutes: 120,
      spentTimeMinutes: 60,
    } as never);

    const insert = inserts.find((i) => i.table === tasks);
    expect(insert?.vals.manualSpentMinutes).toBe(60);
    // New task has no sessions, so the derived total equals the manual entry.
    expect(insert?.vals.spentTimeMinutes).toBe(60);
    expect(insert?.vals.remainingTimeMinutes).toBe(60);
  });

  it('update routes spent time to manualSpentMinutes and re-derives the total', async () => {
    const { service, updates } = buildService({});
    jest
      .spyOn(service as never, 'getTaskForUser')
      .mockResolvedValue({
        id: TASK_ID,
        status: 'todo',
        estimatedTimeMinutes: 120,
        manualSpentMinutes: 0,
      } as never);
    const recompute = jest
      .spyOn(service, 'recomputeTaskSpentTime')
      .mockResolvedValue(undefined);
    jest.spyOn(service as never, 'recalculateProgress').mockResolvedValue(undefined as never);
    jest.spyOn(service as never, 'addActivity').mockResolvedValue(undefined as never);
    jest.spyOn(service as never, 'notifyMembersOfChange').mockResolvedValue(undefined as never);
    jest.spyOn(service as never, 'findOne').mockResolvedValue({} as never);

    await service.update(USER_ID, TASK_ID, { spentTimeMinutes: 90 } as never);

    const taskUpdate = updates.find((u) => u.table === tasks);
    expect(taskUpdate?.vals.manualSpentMinutes).toBe(90);
    // The write path must NOT set the derived total directly.
    expect('spentTimeMinutes' in (taskUpdate?.vals ?? {})).toBe(false);
    expect(recompute).toHaveBeenCalledWith(TASK_ID);
  });
});
