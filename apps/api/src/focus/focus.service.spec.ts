import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../db/database.service';
import {
  focusSessions,
  subtaskDependencies,
  subtasks,
  taskActivities,
  taskMembers,
  tasks,
} from '../db/schema';
import { TaskAccessService } from '../collaboration/task-access.service';
import { TasksService } from '../tasks/tasks.service';
import { FocusService } from './focus.service';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const TASK_ID = '22222222-2222-2222-2222-222222222222';
const SESSION_ID = '33333333-3333-3333-3333-333333333333';
const SUBTASK_ID = '44444444-4444-4444-4444-444444444444';

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
  // task_members rows. Any row present marks its task shared (collaborative);
  // an empty/absent list means every task under test is personal. Tests that
  // exercise the shared-task ownership rule use a single task so the mock's
  // where-agnostic reads stay accurate.
  taskMembersList?: AnyRow[];
  // subtask_dependencies edges ({ subtaskId, dependsOnSubtaskId }).
  subtaskDepsList?: AnyRow[];
  // Additional focus_sessions rows visible to the recompute aggregation (e.g.
  // prior completed sessions for the same task/subtask). The active `session`
  // under test is always element 0 so getSessionForUser still resolves it.
  extraSessions?: AnyRow[];
};

function makeDb(config: DbConfig) {
  const inserts: { table: unknown; vals: AnyRow }[] = [];
  const updates: { table: unknown; vals: AnyRow }[] = [];
  let sessionRow = config.session ? { ...config.session } : null;

  const rowsFor = (table: unknown): unknown[] => {
    if (table === focusSessions) {
      if (config.sessionsList) return config.sessionsList;
      const base = sessionRow ? [sessionRow] : [];
      return [...base, ...(config.extraSessions ?? [])];
    }
    if (table === tasks) return config.tasksList ?? (config.task ? [config.task] : []);
    if (table === subtasks) return config.subtasksList ?? [];
    if (table === taskMembers) return config.taskMembersList ?? [];
    if (table === subtaskDependencies) return config.subtaskDepsList ?? [];
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
    subtaskId: vals.subtaskId ?? null,
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
    subtaskId: null,
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
  const updateSubtask = jest.fn().mockResolvedValue(undefined);
  const recomputeTaskSpentTime = jest.fn().mockResolvedValue(undefined);
  const tasksService = {
    updateSubtask,
    recomputeTaskSpentTime,
  } as unknown as TasksService;
  // A REAL TaskAccessService backed by the same mock db, so start()
  // authorization exercises the actual owner/member/role resolution (owner via
  // tasks.userId, accepted task_members grant editor/viewer).
  const taskAccess = new TaskAccessService({
    db,
  } as unknown as DatabaseService);
  const service = new FocusService(
    { db } as unknown as DatabaseService,
    configService,
    tasksService,
    taskAccess,
  );
  return { service, inserts, updates, updateSubtask, recomputeTaskSpentTime };
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
    it('completes the session, delegates spent-time recompute, and marks the task done', async () => {
      const { service, updates, inserts, recomputeTaskSpentTime } = buildService({
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

      // Spent time is now derived by TasksService, not written here.
      expect(recomputeTaskSpentTime).toHaveBeenCalledWith(TASK_ID);
      const taskUpdates = updates.filter((u) => u.table === tasks);
      expect(taskUpdates.some((u) => u.vals.status === 'done' && u.vals.progress === 100)).toBe(true);

      const activity = inserts.find((i) => i.table === taskActivities);
      expect(activity?.vals.action).toBe('status_changed');
    });

    it('recomputes spent time but leaves the task open when outcome is not done', async () => {
      const { service, updates, recomputeTaskSpentTime } = buildService({
        session: makeSession(),
        task: makeTask(),
      });

      const { taskUpdated } = await service.finish(USER_ID, SESSION_ID, {
        actualMinutes: 20,
        taskOutcome: 'partial',
      });

      expect(taskUpdated).toBe(true);
      expect(recomputeTaskSpentTime).toHaveBeenCalledWith(TASK_ID);
      const taskUpdates = updates.filter((u) => u.table === tasks);
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

    it('narrows to a focus-eligible subtask and returns the full payload', async () => {
      const { service } = buildService({
        tasksList: [
          makeTask({
            id: TASK_ID,
            title: 'AI Exam Preparation',
            priority: 'high',
            isFocusTask: true,
          }),
        ],
        subtasksList: [
          {
            id: SUBTASK_ID,
            taskId: TASK_ID,
            title: 'Review Chapter 1',
            isDone: false,
            isFocusTask: true,
            status: 'todo',
            priority: 'high',
            dueDate: null,
            estimatedDurationMinutes: 40,
            orderIndex: 0,
          },
        ],
      });

      const rec = await service.recommendation(USER_ID);

      expect(rec).toMatchObject({
        taskId: TASK_ID,
        taskTitle: 'AI Exam Preparation',
        subtaskId: SUBTASK_ID,
        subtaskTitle: 'Review Chapter 1',
        estimatedMinutes: 40,
      });
      expect(rec?.recommendationReason.length).toBeGreaterThan(0);
    });

    it('falls back to the task when subtasks exist but none are focus-eligible', async () => {
      const { service } = buildService({
        tasksList: [
          makeTask({ id: TASK_ID, title: 'Backend API', isFocusTask: true }),
        ],
        subtasksList: [
          {
            id: SUBTASK_ID,
            taskId: TASK_ID,
            title: 'Quick note',
            isDone: false,
            isFocusTask: false, // not marked for focus
            status: 'todo',
            priority: 'medium',
            dueDate: null,
            estimatedDurationMinutes: null,
            orderIndex: 0,
          },
        ],
      });

      const rec = await service.recommendation(USER_ID);

      expect(rec?.taskId).toBe(TASK_ID);
      expect(rec?.subtaskId).toBeNull();
      expect(rec?.subtaskTitle).toBeNull();
    });

    it('prefers the highest-ranked task that has an eligible focus subtask', async () => {
      const { service } = buildService({
        tasksList: [
          makeTask({ id: TASK_ID, title: 'Higher-ranked parent', priority: 'urgent' }),
          makeTask({ id: 'lower', title: 'Lower-ranked parent', priority: 'low', isFocusTask: false }),
        ],
      });
      jest
        .spyOn(service as unknown as { selectSubtaskForTask: (taskId: string, now: Date) => Promise<unknown> }, 'selectSubtaskForTask')
        .mockImplementation(async (taskId) =>
          taskId === 'lower'
            ? {
                subtaskId: SUBTASK_ID,
                subtaskTitle: 'Executable focus step',
                estimatedMinutes: 25,
                reason: 'Next up in your plan.',
              }
            : null,
        );

      const rec = await service.recommendation(USER_ID);

      expect(rec).toMatchObject({
        taskId: 'lower',
        taskTitle: 'Lower-ranked parent',
        subtaskId: SUBTASK_ID,
        subtaskTitle: 'Executable focus step',
      });
    });
  });

  describe('subtask-scoped sessions', () => {
    const subtask = {
      id: SUBTASK_ID,
      taskId: TASK_ID,
      title: 'Review Chapter 1',
      isDone: false,
      status: 'todo',
      estimatedDurationMinutes: 40,
      actualDurationMinutes: null,
    };

    describe('start', () => {
      it('creates a session tied to a task and a subtask', async () => {
        const { service, inserts } = buildService({
          task: makeTask(),
          subtasksList: [subtask],
        });

        const result = await service.start(USER_ID, {
          taskId: TASK_ID,
          subtaskId: SUBTASK_ID,
          plannedMinutes: 40,
        });

        expect(result.taskId).toBe(TASK_ID);
        expect(result.subtaskId).toBe(SUBTASK_ID);
        expect(result.subtaskTitle).toBe('Review Chapter 1');
        const sessionInsert = inserts.find((i) => i.table === focusSessions);
        expect(sessionInsert?.vals.subtaskId).toBe(SUBTASK_ID);
      });

      it('rejects a subtask session with no parent task', async () => {
        const { service } = buildService({});
        await expect(
          service.start(USER_ID, {
            subtaskId: SUBTASK_ID,
            plannedMinutes: 25,
          }),
        ).rejects.toBeInstanceOf(BadRequestException);
      });

      it('rejects a task the user does not own (invalid ownership)', async () => {
        // No task rows resolve for this user, so getTaskForUser throws.
        const { service } = buildService({ tasksList: [] });
        await expect(
          service.start(USER_ID, {
            taskId: TASK_ID,
            subtaskId: SUBTASK_ID,
            plannedMinutes: 25,
          }),
        ).rejects.toBeInstanceOf(NotFoundException);
      });

      it('rejects a subtask that does not belong to the task', async () => {
        const { service } = buildService({
          task: makeTask(),
          subtasksList: [], // subtask not found under this task
        });
        await expect(
          service.start(USER_ID, {
            taskId: TASK_ID,
            subtaskId: SUBTASK_ID,
            plannedMinutes: 25,
          }),
        ).rejects.toBeInstanceOf(BadRequestException);
      });
    });

    describe('finish', () => {
      it('reconciles actualDurationMinutes from completed sessions without touching the estimate', async () => {
        const { service, updates } = buildService({
          session: makeSession({ subtaskId: SUBTASK_ID }),
          task: makeTask(),
          subtasksList: [subtask],
        });

        await service.finish(USER_ID, SESSION_ID, { actualMinutes: 25 });

        const subtaskUpdate = updates.find((u) => u.table === subtasks);
        expect(subtaskUpdate?.vals.actualDurationMinutes).toBe(25);
        // The planning estimate must never be overwritten by focus time.
        expect('estimatedDurationMinutes' in (subtaskUpdate?.vals ?? {})).toBe(
          false,
        );
      });

      it('completes only the subtask via updateSubtask when outcome is done', async () => {
        const { service, updates, inserts, updateSubtask } = buildService({
          session: makeSession({ subtaskId: SUBTASK_ID }),
          task: makeTask(),
          subtasksList: [subtask],
        });

        const { taskUpdated } = await service.finish(USER_ID, SESSION_ID, {
          actualMinutes: 25,
          taskOutcome: 'done',
        });

        expect(taskUpdated).toBe(true);
        expect(updateSubtask).toHaveBeenCalledWith(USER_ID, TASK_ID, SUBTASK_ID, {
          status: 'done',
          isDone: true,
        });
        // The parent task is NOT force-completed directly (progress rolls up
        // through updateSubtask instead).
        const taskUpdates = updates.filter((u) => u.table === tasks);
        expect(taskUpdates.some((u) => u.vals.status === 'done')).toBe(false);
        const statusActivity = inserts.find(
          (i) => i.table === taskActivities && i.vals.action === 'status_changed',
        );
        expect(statusActivity).toBeUndefined();
      });
    });

    describe('task-level compatibility', () => {
      it('does not reuse updateSubtask for task-level sessions', async () => {
        const { service, updateSubtask } = buildService({
          session: makeSession(), // no subtaskId
          task: makeTask(),
        });

        await service.finish(USER_ID, SESSION_ID, {
          actualMinutes: 25,
          taskOutcome: 'done',
        });

        expect(updateSubtask).not.toHaveBeenCalled();
      });
    });
  });

  describe('task spent-time recompute delegation', () => {
    // The manual+focus derivation lives in TasksService.recomputeTaskSpentTime
    // (unit-tested in tasks.spent-time.spec). Here we only verify FocusService
    // delegates to it for every session that carries a task id.
    const subtask = {
      id: SUBTASK_ID,
      taskId: TASK_ID,
      title: 'Review Chapter 1',
      estimatedDurationMinutes: 40,
    };

    it('delegates recompute after finishing a subtask-scoped session', async () => {
      const { service, recomputeTaskSpentTime } = buildService({
        session: makeSession({ subtaskId: SUBTASK_ID }),
        task: makeTask(),
        subtasksList: [subtask],
      });

      await service.finish(USER_ID, SESSION_ID, { actualMinutes: 25 });

      expect(recomputeTaskSpentTime).toHaveBeenCalledWith(TASK_ID);
    });

    it('delegates recompute after cancelling a session', async () => {
      const { service, recomputeTaskSpentTime } = buildService({
        session: makeSession({ subtaskId: SUBTASK_ID }),
        task: makeTask(),
        subtasksList: [subtask],
      });

      await service.cancel(USER_ID, SESSION_ID, { actualMinutes: 10 });

      expect(recomputeTaskSpentTime).toHaveBeenCalledWith(TASK_ID);
    });

    it('does not recompute when a session has no task', async () => {
      const { service, recomputeTaskSpentTime } = buildService({
        session: makeSession({ taskId: null, subtaskId: null }),
      });

      await service.finish(USER_ID, SESSION_ID, { actualMinutes: 25 });

      expect(recomputeTaskSpentTime).not.toHaveBeenCalled();
    });
  });

  // The shared-task assignment rule (isSubtaskOwnedByUser) applied across every
  // Focus surface: session start authorization, the recommendation, and the
  // queue (picker). A subtask belongs to the current user only when
  // assigneeUserId === user id on a shared task; personal tasks are unaffected.
  describe('shared-task subtask ownership', () => {
    const OTHER_USER_ID = '99999999-9999-9999-9999-999999999999';
    const FOREIGN_SUBTASK_ID = '55555555-5555-5555-5555-555555555555';
    const SHARED_MEMBERS = [{ taskId: TASK_ID }];

    function makeSubtask(overrides: AnyRow = {}): AnyRow {
      return {
        id: SUBTASK_ID,
        taskId: TASK_ID,
        title: 'My step',
        isDone: false,
        isFocusTask: true,
        status: 'todo',
        priority: 'medium',
        dueDate: null,
        estimatedDurationMinutes: 30,
        orderIndex: 0,
        assigneeUserId: USER_ID,
        ...overrides,
      };
    }

    describe('session start authorization', () => {
      it('rejects starting a session for another member’s subtask', async () => {
        const { service } = buildService({
          task: makeTask(),
          taskMembersList: SHARED_MEMBERS,
          subtasksList: [makeSubtask({ assigneeUserId: OTHER_USER_ID })],
        });

        await expect(
          service.start(USER_ID, {
            taskId: TASK_ID,
            subtaskId: SUBTASK_ID,
            plannedMinutes: 25,
          }),
        ).rejects.toBeInstanceOf(ForbiddenException);
      });

      it('rejects starting a session for an unassigned shared subtask', async () => {
        const { service } = buildService({
          task: makeTask(),
          taskMembersList: SHARED_MEMBERS,
          subtasksList: [makeSubtask({ assigneeUserId: null })],
        });

        await expect(
          service.start(USER_ID, {
            taskId: TASK_ID,
            subtaskId: SUBTASK_ID,
            plannedMinutes: 25,
          }),
        ).rejects.toBeInstanceOf(ForbiddenException);
      });

      it('accepts a session for the current user’s assigned shared subtask', async () => {
        const { service, inserts } = buildService({
          task: makeTask(),
          taskMembersList: SHARED_MEMBERS,
          subtasksList: [makeSubtask({ assigneeUserId: USER_ID })],
        });

        const result = await service.start(USER_ID, {
          taskId: TASK_ID,
          subtaskId: SUBTASK_ID,
          plannedMinutes: 25,
        });

        expect(result.subtaskId).toBe(SUBTASK_ID);
        const sessionInsert = inserts.find((i) => i.table === focusSessions);
        expect(sessionInsert?.vals.subtaskId).toBe(SUBTASK_ID);
      });

      it('allows a personal-task subtask regardless of assignee (non-shared)', async () => {
        const { service } = buildService({
          task: makeTask(),
          // No task_members → personal task; assignee is irrelevant.
          subtasksList: [makeSubtask({ assigneeUserId: OTHER_USER_ID })],
        });

        const result = await service.start(USER_ID, {
          taskId: TASK_ID,
          subtaskId: SUBTASK_ID,
          plannedMinutes: 25,
        });
        expect(result.subtaskId).toBe(SUBTASK_ID);
      });
    });

    describe('recommendation', () => {
      it('never recommends another member’s shared subtask (contributes nothing)', async () => {
        const { service } = buildService({
          tasksList: [makeTask({ isFocusTask: true })],
          taskMembersList: SHARED_MEMBERS,
          subtasksList: [
            makeSubtask({ id: FOREIGN_SUBTASK_ID, assigneeUserId: OTHER_USER_ID }),
          ],
        });

        // The shared task's only incomplete subtask is foreign, so the task
        // contributes zero candidates and the parent is never a fallback.
        expect(await service.recommendation(USER_ID)).toBeNull();
      });

      it('never recommends an unassigned shared subtask', async () => {
        const { service } = buildService({
          tasksList: [makeTask({ isFocusTask: true })],
          taskMembersList: SHARED_MEMBERS,
          subtasksList: [
            makeSubtask({ id: FOREIGN_SUBTASK_ID, assigneeUserId: null }),
          ],
        });

        expect(await service.recommendation(USER_ID)).toBeNull();
      });

      it('recommends the current user’s assigned shared subtask', async () => {
        const { service } = buildService({
          tasksList: [makeTask({ isFocusTask: true })],
          taskMembersList: SHARED_MEMBERS,
          subtasksList: [makeSubtask({ assigneeUserId: USER_ID })],
        });

        const rec = await service.recommendation(USER_ID);
        expect(rec?.taskId).toBe(TASK_ID);
        expect(rec?.subtaskId).toBe(SUBTASK_ID);
      });

      it('ignores a higher-ranked foreign subtask when picking the user’s work', async () => {
        const { service } = buildService({
          tasksList: [makeTask({ isFocusTask: true })],
          taskMembersList: SHARED_MEMBERS,
          subtasksList: [
            // Owned but low priority.
            makeSubtask({
              id: SUBTASK_ID,
              assigneeUserId: USER_ID,
              priority: 'low',
            }),
            // Foreign and urgent — would win ranking if it leaked in.
            makeSubtask({
              id: FOREIGN_SUBTASK_ID,
              assigneeUserId: OTHER_USER_ID,
              priority: 'urgent',
            }),
          ],
        });

        const rec = await service.recommendation(USER_ID);
        expect(rec?.subtaskId).toBe(SUBTASK_ID);
        expect(rec?.subtaskId).not.toBe(FOREIGN_SUBTASK_ID);
      });

      it('does not fall back to the shared parent when no child belongs to the user', async () => {
        const { service } = buildService({
          // Parent explicitly marked for focus — still must not be used as a
          // fallback because its incomplete subtasks are all another member's.
          tasksList: [makeTask({ isFocusTask: true })],
          taskMembersList: SHARED_MEMBERS,
          subtasksList: [
            makeSubtask({
              id: FOREIGN_SUBTASK_ID,
              assigneeUserId: OTHER_USER_ID,
              isFocusTask: false,
            }),
          ],
        });

        expect(await service.recommendation(USER_ID)).toBeNull();
      });

      it('keeps a user subtask blocked by a foreign dependency without exposing it', async () => {
        const { service } = buildService({
          tasksList: [makeTask({ isFocusTask: true })],
          taskMembersList: SHARED_MEMBERS,
          subtasksList: [
            makeSubtask({ id: SUBTASK_ID, assigneeUserId: USER_ID }),
            makeSubtask({
              id: FOREIGN_SUBTASK_ID,
              assigneeUserId: OTHER_USER_ID,
              isDone: false,
            }),
          ],
          // The user's subtask depends on the foreign, still-open subtask.
          subtaskDepsList: [
            { subtaskId: SUBTASK_ID, dependsOnSubtaskId: FOREIGN_SUBTASK_ID },
          ],
        });

        const rec = await service.recommendation(USER_ID);
        // The blocked subtask is not recommended, and the shared parent is never
        // used as a fallback while it still has incomplete subtasks — so the
        // task contributes no recommendation and the foreign dependency is never
        // surfaced.
        expect(rec).toBeNull();
      });

      it('recommends a personal-task subtask normally (non-shared)', async () => {
        const { service } = buildService({
          tasksList: [makeTask({ isFocusTask: true })],
          // No members → personal; the assignee field is irrelevant.
          subtasksList: [makeSubtask({ assigneeUserId: null })],
        });

        const rec = await service.recommendation(USER_ID);
        expect(rec?.subtaskId).toBe(SUBTASK_ID);
      });
    });

    describe('queue (picker)', () => {
      it('excludes another member’s shared subtask', async () => {
        const { service } = buildService({
          tasksList: [makeTask({ isFocusTask: true })],
          taskMembersList: SHARED_MEMBERS,
          subtasksList: [
            makeSubtask({ id: SUBTASK_ID, assigneeUserId: USER_ID }),
            makeSubtask({ id: FOREIGN_SUBTASK_ID, assigneeUserId: OTHER_USER_ID }),
          ],
        });

        const queue = await service.queue(USER_ID);
        const subtaskIds = queue.map((item) => item.subtaskId);
        expect(subtaskIds).toContain(SUBTASK_ID);
        expect(subtaskIds).not.toContain(FOREIGN_SUBTASK_ID);
      });

      it('excludes an unassigned shared subtask', async () => {
        const { service } = buildService({
          tasksList: [makeTask({ isFocusTask: true })],
          taskMembersList: SHARED_MEMBERS,
          subtasksList: [
            makeSubtask({ id: SUBTASK_ID, assigneeUserId: USER_ID }),
            makeSubtask({ id: FOREIGN_SUBTASK_ID, assigneeUserId: null }),
          ],
        });

        const queue = await service.queue(USER_ID);
        const subtaskIds = queue.map((item) => item.subtaskId);
        expect(subtaskIds).toContain(SUBTASK_ID);
        expect(subtaskIds).not.toContain(FOREIGN_SUBTASK_ID);
      });

      it('keeps personal-task subtasks available (non-shared)', async () => {
        const { service } = buildService({
          tasksList: [makeTask({ isFocusTask: true })],
          subtasksList: [
            makeSubtask({ id: SUBTASK_ID, assigneeUserId: null }),
            makeSubtask({ id: FOREIGN_SUBTASK_ID, assigneeUserId: OTHER_USER_ID }),
          ],
        });

        const queue = await service.queue(USER_ID);
        const subtaskIds = queue.map((item) => item.subtaskId);
        expect(subtaskIds).toContain(SUBTASK_ID);
        expect(subtaskIds).toContain(FOREIGN_SUBTASK_ID);
      });

      it('keeps a personal parent task without subtasks selectable', async () => {
        const { service } = buildService({
          tasksList: [makeTask({ isFocusTask: true })],
          // No subtasks at all → the parent remains a task-level Focus choice.
          subtasksList: [],
        });

        const queue = await service.queue(USER_ID);
        expect(queue).toHaveLength(1);
        expect(queue[0]).toMatchObject({ taskId: TASK_ID, subtaskId: null });
      });
    });
  });

  // A user who is an ACCEPTED MEMBER of a shared task they do NOT own must be
  // able to focus subtasks assigned to them — even though tasks.userId is
  // someone else. Reuses the same canonical ownership rule; membership alone
  // (with no assigned subtask) still yields nothing.
  describe('non-owner member of a shared task', () => {
    const OWNER_ID = '88888888-8888-8888-8888-888888888888';
    const OTHER_USER_ID = '99999999-9999-9999-9999-999999999999';
    const FOREIGN_SUBTASK_ID = '55555555-5555-5555-5555-555555555555';
    // The current user (USER_ID) is an accepted editor; the task is owned by
    // OWNER_ID.
    const MEMBERSHIP = [
      { taskId: TASK_ID, userId: USER_ID, status: 'accepted', role: 'editor' },
    ];

    function sharedTask(overrides: AnyRow = {}): AnyRow {
      return makeTask({ userId: OWNER_ID, isFocusTask: true, ...overrides });
    }

    function makeSubtask(overrides: AnyRow = {}): AnyRow {
      return {
        id: SUBTASK_ID,
        taskId: TASK_ID,
        title: 'My step',
        isDone: false,
        isFocusTask: true,
        status: 'todo',
        priority: 'medium',
        dueDate: null,
        estimatedDurationMinutes: 30,
        orderIndex: 0,
        assigneeUserId: USER_ID,
        ...overrides,
      };
    }

    it('shows the member’s assigned shared subtask in the queue', async () => {
      const { service } = buildService({
        tasksList: [sharedTask()],
        taskMembersList: MEMBERSHIP,
        subtasksList: [
          makeSubtask({ id: SUBTASK_ID, assigneeUserId: USER_ID }),
          makeSubtask({ id: FOREIGN_SUBTASK_ID, assigneeUserId: OTHER_USER_ID }),
        ],
      });

      const queue = await service.queue(USER_ID);
      const subtaskIds = queue.map((item) => item.subtaskId);
      expect(subtaskIds).toContain(SUBTASK_ID);
      expect(subtaskIds).not.toContain(FOREIGN_SUBTASK_ID);
    });

    it('recommends the member’s assigned shared subtask', async () => {
      const { service } = buildService({
        tasksList: [sharedTask()],
        taskMembersList: MEMBERSHIP,
        subtasksList: [makeSubtask({ assigneeUserId: USER_ID })],
      });

      const rec = await service.recommendation(USER_ID);
      expect(rec?.taskId).toBe(TASK_ID);
      expect(rec?.subtaskId).toBe(SUBTASK_ID);
    });

    it('lets the member start a session on their assigned shared subtask', async () => {
      const { service, inserts } = buildService({
        tasksList: [sharedTask()],
        taskMembersList: MEMBERSHIP,
        subtasksList: [makeSubtask({ assigneeUserId: USER_ID })],
      });

      const result = await service.start(USER_ID, {
        taskId: TASK_ID,
        subtaskId: SUBTASK_ID,
        plannedMinutes: 25,
      });

      expect(result.subtaskId).toBe(SUBTASK_ID);
      const sessionInsert = inserts.find((i) => i.table === focusSessions);
      expect(sessionInsert?.vals.subtaskId).toBe(SUBTASK_ID);
    });

    it('rejects the member starting another member’s subtask', async () => {
      const { service } = buildService({
        tasksList: [sharedTask()],
        taskMembersList: MEMBERSHIP,
        subtasksList: [
          makeSubtask({ id: SUBTASK_ID, assigneeUserId: OTHER_USER_ID }),
        ],
      });

      await expect(
        service.start(USER_ID, {
          taskId: TASK_ID,
          subtaskId: SUBTASK_ID,
          plannedMinutes: 25,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects the member starting an unassigned shared subtask', async () => {
      const { service } = buildService({
        tasksList: [sharedTask()],
        taskMembersList: MEMBERSHIP,
        subtasksList: [makeSubtask({ id: SUBTASK_ID, assigneeUserId: null })],
      });

      await expect(
        service.start(USER_ID, {
          taskId: TASK_ID,
          subtaskId: SUBTASK_ID,
          plannedMinutes: 25,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects the member starting a task-level session on the shared task', async () => {
      const { service } = buildService({
        tasksList: [sharedTask()],
        taskMembersList: MEMBERSHIP,
        subtasksList: [makeSubtask({ assigneeUserId: USER_ID })],
      });

      // No subtaskId → task-level focus on a shared task, reserved for the owner.
      await expect(
        service.start(USER_ID, { taskId: TASK_ID, plannedMinutes: 25 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('produces no candidate from membership alone (no assigned subtask)', async () => {
      const { service } = buildService({
        tasksList: [sharedTask()],
        taskMembersList: MEMBERSHIP,
        subtasksList: [
          makeSubtask({ id: FOREIGN_SUBTASK_ID, assigneeUserId: OTHER_USER_ID }),
        ],
      });

      expect(await service.recommendation(USER_ID)).toBeNull();
      expect(await service.queue(USER_ID)).toHaveLength(0);
    });

    it('produces no candidate from an unassigned shared subtask', async () => {
      const { service } = buildService({
        tasksList: [sharedTask()],
        taskMembersList: MEMBERSHIP,
        subtasksList: [
          makeSubtask({ id: FOREIGN_SUBTASK_ID, assigneeUserId: null }),
        ],
      });

      expect(await service.recommendation(USER_ID)).toBeNull();
      expect(await service.queue(USER_ID)).toHaveLength(0);
    });

    it('ignores a higher-ranked foreign subtask when picking the member’s work', async () => {
      const { service } = buildService({
        tasksList: [sharedTask()],
        taskMembersList: MEMBERSHIP,
        subtasksList: [
          makeSubtask({
            id: SUBTASK_ID,
            assigneeUserId: USER_ID,
            priority: 'low',
          }),
          makeSubtask({
            id: FOREIGN_SUBTASK_ID,
            assigneeUserId: OTHER_USER_ID,
            priority: 'urgent',
          }),
        ],
      });

      const rec = await service.recommendation(USER_ID);
      expect(rec?.subtaskId).toBe(SUBTASK_ID);
    });

    it('does not duplicate a candidate when the user is both owner and member', async () => {
      const { service } = buildService({
        // Owned by the current user AND carrying a membership row for them.
        tasksList: [makeTask({ userId: USER_ID, isFocusTask: true })],
        taskMembersList: [
          { taskId: TASK_ID, userId: USER_ID, status: 'accepted', role: 'owner' },
        ],
        subtasksList: [makeSubtask({ id: SUBTASK_ID, assigneeUserId: USER_ID })],
      });

      const queue = await service.queue(USER_ID);
      expect(queue.filter((item) => item.subtaskId === SUBTASK_ID)).toHaveLength(
        1,
      );
    });

    it('keeps the member’s subtask blocked by a foreign dependency without exposing it', async () => {
      const { service } = buildService({
        tasksList: [sharedTask()],
        taskMembersList: MEMBERSHIP,
        subtasksList: [
          makeSubtask({ id: SUBTASK_ID, assigneeUserId: USER_ID }),
          makeSubtask({
            id: FOREIGN_SUBTASK_ID,
            assigneeUserId: OTHER_USER_ID,
            isDone: false,
          }),
        ],
        subtaskDepsList: [
          { subtaskId: SUBTASK_ID, dependsOnSubtaskId: FOREIGN_SUBTASK_ID },
        ],
      });

      // Blocked → not offered as an eligible queue subtask, and the foreign
      // dependency is never surfaced.
      const queue = await service.queue(USER_ID);
      const subtaskIds = queue.map((item) => item.subtaskId);
      expect(subtaskIds).not.toContain(SUBTASK_ID);
      expect(subtaskIds).not.toContain(FOREIGN_SUBTASK_ID);
    });
  });
});
