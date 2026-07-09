import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../db/database.service';
import { focusSessions, subtasks, taskActivities, tasks } from '../db/schema';
import { FocusService } from './focus.service';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const TASK_ID = '22222222-2222-2222-2222-222222222222';
const SESSION_ID = '33333333-3333-3333-3333-333333333333';

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

type DbConfig = {
  session?: AnyRow | null;
  task?: AnyRow | null;
  sessionsList?: AnyRow[];
  tasksList?: AnyRow[];
  subtasksList?: AnyRow[];
};

function makeDb(config: DbConfig) {
  const inserts: { table: unknown; vals: AnyRow }[] = [];
  const updates: { table: unknown; vals: AnyRow }[] = [];
  let sessionRow = config.session ? { ...config.session } : null;

  const rowsFor = (table: unknown): unknown[] => {
    if (table === focusSessions) {
      return config.sessionsList ?? (sessionRow ? [sessionRow] : []);
    }
    if (table === tasks) return config.tasksList ?? (config.task ? [config.task] : []);
    if (table === subtasks) return config.subtasksList ?? [];
    return [];
  };

  const db = {
    insert: (table: unknown) => ({
      values: (vals: AnyRow) => {
        inserts.push({ table, vals });
        const row = table === focusSessions ? buildInsertedSession(vals) : { ...vals };
        return chain([row]);
      },
    }),
    update: (table: unknown) => ({
      set: (vals: AnyRow) => {
        updates.push({ table, vals });
        let returned: unknown[] = [{ ...vals }];
        if (table === focusSessions && sessionRow) {
          sessionRow = { ...sessionRow, ...vals };
          returned = [sessionRow];
        }
        return { where: () => chain(returned) };
      },
    }),
    select: (_cols?: unknown) => ({ from: (table: unknown) => chain(rowsFor(table)) }),
  };

  return { db, inserts, updates };
}

function buildInsertedSession(vals: AnyRow): AnyRow {
  return {
    id: SESSION_ID,
    userId: vals.userId,
    taskId: vals.taskId ?? null,
    startedAt: (vals.startedAt as Date) ?? new Date(),
    endedAt: null,
    plannedMinutes: vals.plannedMinutes ?? 25,
    actualMinutes: null,
    status: vals.status ?? 'active',
    sessionType: vals.sessionType ?? 'pomodoro',
    notes: null,
    createdAt: new Date(),
  };
}

function makeTask(overrides: AnyRow = {}): AnyRow {
  return {
    id: TASK_ID,
    userId: USER_ID,
    title: 'Backend API',
    priority: 'high',
    status: 'in_progress',
    progress: 40,
    dueDate: null,
    estimatedTimeMinutes: 120,
    spentTimeMinutes: 30,
    remainingTimeMinutes: 90,
    isFocusTask: true,
    updatedAt: new Date('2026-07-01T00:00:00Z'),
    ...overrides,
  };
}

function makeSession(overrides: AnyRow = {}): AnyRow {
  return {
    id: SESSION_ID,
    userId: USER_ID,
    taskId: TASK_ID,
    startedAt: new Date('2026-07-08T09:00:00Z'),
    endedAt: null,
    plannedMinutes: 25,
    actualMinutes: null,
    status: 'active',
    sessionType: 'pomodoro',
    notes: null,
    createdAt: new Date('2026-07-08T09:00:00Z'),
    ...overrides,
  };
}

function buildService(config: DbConfig) {
  const { db, inserts, updates } = makeDb(config);
  const configService = { get: () => undefined } as unknown as ConfigService; // no AI keys
  const service = new FocusService(
    { db } as unknown as DatabaseService,
    configService,
  );
  return { service, inserts, updates };
}

describe('FocusService', () => {
  describe('start', () => {
    it('creates an active session tied to a task', async () => {
      const { service, inserts } = buildService({ task: makeTask() });
      const result = await service.start(USER_ID, {
        taskId: TASK_ID,
        plannedMinutes: 25,
        sessionType: 'pomodoro',
      });

      expect(result.status).toBe('active');
      expect(result.taskId).toBe(TASK_ID);
      expect(result.taskTitle).toBe('Backend API');
      const sessionInsert = inserts.find((i) => i.table === focusSessions);
      expect(sessionInsert?.vals.status).toBe('active');
      expect(sessionInsert?.vals.plannedMinutes).toBe(25);
    });

    it('creates a session without a task', async () => {
      const { service } = buildService({});
      const result = await service.start(USER_ID, { plannedMinutes: 50 });
      expect(result.taskId).toBeNull();
      expect(result.taskTitle).toBeNull();
    });
  });

  describe('finish', () => {
    it('completes the session, logs focus time, and marks the task done', async () => {
      const { service, updates, inserts } = buildService({
        session: makeSession(),
        task: makeTask(),
      });

      const { session, taskUpdated } = await service.finish(USER_ID, SESSION_ID, {
        actualMinutes: 25,
        taskOutcome: 'done',
      });

      expect(session.status).toBe('completed');
      expect(session.actualMinutes).toBe(25);
      expect(taskUpdated).toBe(true);

      const sessionUpdate = updates.find((u) => u.table === focusSessions);
      expect(sessionUpdate?.vals.status).toBe('completed');

      const taskUpdates = updates.filter((u) => u.table === tasks);
      // Focus time applied (spent 30 + 25 = 55) and status set to done.
      expect(taskUpdates.some((u) => u.vals.spentTimeMinutes === 55)).toBe(true);
      expect(taskUpdates.some((u) => u.vals.status === 'done' && u.vals.progress === 100)).toBe(true);

      const activity = inserts.find((i) => i.table === taskActivities);
      expect(activity?.vals.action).toBe('status_changed');
    });

    it('applies focus time but leaves the task open when outcome is not done', async () => {
      const { service, updates } = buildService({
        session: makeSession(),
        task: makeTask(),
      });

      const { taskUpdated } = await service.finish(USER_ID, SESSION_ID, {
        actualMinutes: 20,
        taskOutcome: 'partial',
      });

      expect(taskUpdated).toBe(true);
      const taskUpdates = updates.filter((u) => u.table === tasks);
      expect(taskUpdates.some((u) => u.vals.spentTimeMinutes === 50)).toBe(true);
      expect(taskUpdates.some((u) => u.vals.status === 'done')).toBe(false);
    });

    it('rejects finishing an already-ended session', async () => {
      const { service } = buildService({
        session: makeSession({ status: 'completed' }),
      });
      await expect(
        service.finish(USER_ID, SESSION_ID, {}),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('cancel', () => {
    it('marks the session cancelled without changing task status', async () => {
      const { service, updates } = buildService({
        session: makeSession(),
        task: makeTask(),
      });

      const result = await service.cancel(USER_ID, SESSION_ID, { actualMinutes: 10 });

      expect(result.status).toBe('cancelled');
      expect(result.actualMinutes).toBe(10);
      const taskUpdates = updates.filter((u) => u.table === tasks);
      expect(taskUpdates.some((u) => u.vals.status === 'done')).toBe(false);
    });
  });

  describe('stats', () => {
    it('computes stats from the session history', async () => {
      const { service } = buildService({
        sessionsList: [
          {
            taskId: TASK_ID,
            startedAt: new Date(),
            plannedMinutes: 25,
            actualMinutes: 25,
            status: 'completed',
          },
        ],
        tasksList: [{ id: TASK_ID, title: 'Backend API' }],
      });

      const stats = await service.stats(USER_ID);
      expect(stats.sessionsToday).toBe(1);
      expect(stats.focusMinutesToday).toBe(25);
      expect(stats.completedSessionsToday).toBe(1);
    });
  });

  describe('recommendation', () => {
    it('recommends the best focus task using rules', async () => {
      const { service } = buildService({
        tasksList: [
          makeTask({ id: TASK_ID, title: 'Backend API', priority: 'high', isFocusTask: true }),
          makeTask({ id: 'other', title: 'Small task', priority: 'low', isFocusTask: false, status: 'todo' }),
        ],
        subtasksList: [{ taskId: TASK_ID, isDone: false }],
      });

      const recommendation = await service.recommendation(USER_ID);
      expect(recommendation?.taskId).toBe(TASK_ID);
      expect(recommendation?.reason.length).toBeGreaterThan(0);
    });

    it('returns null when there are no actionable tasks', async () => {
      const { service } = buildService({ tasksList: [] });
      expect(await service.recommendation(USER_ID)).toBeNull();
    });
  });
});
