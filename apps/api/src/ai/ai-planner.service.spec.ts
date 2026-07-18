import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../db/database.service';
import {
  AiPlannerService,
  type DailyPlan,
  type DailyPlanItem,
} from './ai-planner.service';
import { PlannerDurationEstimator } from './planner/planner-duration-estimator';
import {
  PlannerPreferencesService,
  DEFAULT_PLANNER_PREFERENCES,
} from './planner/planner-preferences.service';
import { PlannerReasoningEngine } from './planner/planner-reasoning-engine';
import { PlannerRuleEngine } from './planner/planner-rule-engine';
import { PlannerSchedulerEngine } from './planner/planner-scheduler-engine';import { PlannerAcceptanceService } from './planner/planner-acceptance.service';import type { PlannerPreferences } from './planner/planner.types';
import {
  plannerPreferences,
  reminders,
  taskDependencies,
  tasks,
} from '../db/schema';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const DATE = '2026-07-06';

type Overrides = Partial<Record<string, unknown>>;

function makeTask(
  id: string,
  overrides: Overrides = {},
): Record<string, unknown> {
  return {
    id,
    userId: USER_ID,
    title: `Task ${id}`,
    description: null,
    priority: 'medium',
    status: 'todo',
    progress: 0,
    dueDate: null,
    dueTime: null,
    categoryId: null,
    category: null,
    notes: null,
    estimatedTimeMinutes: 60,
    spentTimeMinutes: 0,
    remainingTimeMinutes: 0,
    reminderEnabled: false,
    reminderBeforeMinutes: null,
    labels: null,
    attachments: null,
    isFavorite: false,
    isFocusTask: false,
    recurrenceRootId: null,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    ...overrides,
  };
}

function makeReminder(
  id: string,
  overrides: Overrides = {},
): Record<string, unknown> {
  return {
    id,
    userId: USER_ID,
    title: `Reminder ${id}`,
    type: 'time',
    triggerDateTime: new Date('2026-07-06T11:00:00.000Z'),
    reminderBefore: null,
    repeat: 'none',
    repeatInterval: null,
    repeatDaysOfWeek: null,
    repeatEndDate: null,
    notes: null,
    priority: 'medium',
    status: 'active',
    location: null,
    context: null,
    checklistItems: null,
    isOrphaned: false,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    ...overrides,
  };
}

/**
 * Minimal drizzle-shaped stub. `select().from(table)` routes by table identity.
 * The returned object is a thenable that also exposes `.where()`/`.limit()`, so
 * both `.from(x).where(...)` (tasks/reminders) and
 * `.from(x).where(...).limit(1)` (preferences) resolve to the right rows.
 */
function query(rows: unknown[]) {
  const promise = Promise.resolve(rows);
  return {
    where: () => query(rows),
    limit: () => query(rows),
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally.bind(promise),
  };
}

function makeDb(
  taskRows: unknown[],
  reminderRows: unknown[],
  depRows: unknown[],
  prefRows: unknown[],
) {
  return {
    select: jest.fn(() => ({
      from: (table: unknown) => {
        if (table === tasks) return query(taskRows);
        if (table === reminders) return query(reminderRows);
        if (table === taskDependencies) return query(depRows);
        if (table === plannerPreferences) return query(prefRows);
        return query([]);
      },
    })),
  };
}

function buildService(
  taskRows: unknown[],
  reminderRows: unknown[] = [],
  depRows: unknown[] = [],
  prefRows: unknown[] = [],
) {
  const db = makeDb(taskRows, reminderRows, depRows, prefRows);
  const config = { get: () => undefined } as unknown as ConfigService; // no AI keys -> deterministic
  const reasoning = new PlannerReasoningEngine(config);
  const preferences = new PlannerPreferencesService({
    db,
  } as unknown as DatabaseService);
  const service = new AiPlannerService(
    { db } as unknown as DatabaseService,
    new PlannerRuleEngine(),
    reasoning,
    new PlannerSchedulerEngine(),
    new PlannerDurationEstimator(config),
    preferences,
    config,
  );
  return { service, reasoning, preferences };
}

function withPreferences(
  overrides: Partial<PlannerPreferences>,
): PlannerPreferences {
  return {
    ...DEFAULT_PLANNER_PREFERENCES,
    ...overrides,
    energy: { ...DEFAULT_PLANNER_PREFERENCES.energy, ...overrides.energy },
  };
}

function taskItems(plan: DailyPlan): DailyPlanItem[] {
  return Object.values(plan.sections)
    .flat()
    .filter((item) => item.type === 'task')
    .sort((a, b) => toMin(a.startTime) - toMin(b.startTime));
}

function allItems(plan: DailyPlan): DailyPlanItem[] {
  return Object.values(plan.sections)
    .flat()
    .sort((a, b) => toMin(a.startTime) - toMin(b.startTime));
}

function toMin(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

describe('AiPlannerService (3-layer pipeline)', () => {
  describe('fallback behavior when AI is unavailable', () => {
    it('produces a deterministic plan tagged as fallback', async () => {
      const { service } = buildService([makeTask('a')]);
      const plan = await service.generateDailyPlan(USER_ID, {
        date: DATE,
        breaks: [],
      });

      expect(plan.source).toBe('fallback');
      expect(taskItems(plan).length).toBeGreaterThan(0);
    });
  });

  describe('due-today tasks prioritized', () => {
    it('schedules a due-today task before a higher-priority task with no deadline', async () => {
      const rows = [
        makeTask('high', { priority: 'high' }),
        makeTask('due', {
          priority: 'low',
          dueDate: new Date('2026-07-06T12:00:00.000Z'),
        }),
      ];
      const { service } = buildService(rows);
      const plan = await service.generateDailyPlan(USER_ID, {
        date: DATE,
        breaks: [],
      });

      const first = taskItems(plan)[0];
      expect(first.taskId).toBe('due');
      expect(first.rationale?.toLowerCase()).toContain('due');
    });
  });

  describe('dependency ordering', () => {
    it('marks a task blocked by an incomplete dependency as unscheduled', async () => {
      const rows = [makeTask('a'), makeTask('b')];
      const deps = [
        { taskId: 'b', dependencyTaskId: 'a', createdAt: new Date() },
      ];
      const { service } = buildService(rows, [], deps);
      const plan = await service.generateDailyPlan(USER_ID, {
        date: DATE,
        breaks: [],
      });

      expect(taskItems(plan).some((item) => item.taskId === 'a')).toBe(true);
      expect(taskItems(plan).some((item) => item.taskId === 'b')).toBe(false);
      const blocked = plan.unscheduled.find((item) => item.taskId === 'b');
      expect(blocked).toBeDefined();
      expect(blocked?.reason.toLowerCase()).toContain('dependency');
    });

    it('does not block a task whose dependency is no longer active (already done)', async () => {
      const rows = [makeTask('b')];
      const deps = [
        { taskId: 'b', dependencyTaskId: 'ghost-done', createdAt: new Date() },
      ];
      const { service } = buildService(rows, [], deps);
      const plan = await service.generateDailyPlan(USER_ID, {
        date: DATE,
        breaks: [],
      });

      expect(taskItems(plan).some((item) => item.taskId === 'b')).toBe(true);
      expect(plan.unscheduled.some((item) => item.taskId === 'b')).toBe(false);
    });
  });

  describe('no time overlaps', () => {
    it('never overlaps tasks, breaks, reminders or locked items', async () => {
      const rows = [
        makeTask('a', { estimatedTimeMinutes: 90, isFocusTask: true }),
        makeTask('b', { estimatedTimeMinutes: 60 }),
        makeTask('c', { estimatedTimeMinutes: 45 }),
      ];
      const { service } = buildService(rows, [makeReminder('r1')]);
      const plan = await service.generateDailyPlan(USER_ID, {
        date: DATE,
        lockedItems: [{ taskId: 'b', startTime: '09:00', endTime: '10:00' }],
      });

      const items = allItems(plan);
      for (let i = 1; i < items.length; i += 1) {
        expect(toMin(items[i].startTime)).toBeGreaterThanOrEqual(
          toMin(items[i - 1].endTime),
        );
      }
    });
  });

  describe('locked tasks stay fixed', () => {
    it('keeps a locked task at its exact time and does not duplicate it', async () => {
      const rows = [makeTask('x'), makeTask('y', { estimatedTimeMinutes: 60 })];
      const { service } = buildService(rows);
      const plan = await service.generateDailyPlan(USER_ID, {
        date: DATE,
        breaks: [],
        lockedItems: [{ taskId: 'x', startTime: '09:00', endTime: '10:00' }],
      });

      const locked = allItems(plan).filter((item) => item.taskId === 'x');
      expect(locked).toHaveLength(1);
      expect(locked[0].startTime).toBe('09:00');
      expect(locked[0].endTime).toBe('10:00');
      expect(locked[0].locked).toBe(true);
    });
  });

  describe('breaks inserted', () => {
    it('inserts a break between work blocks when a task is split', async () => {
      const rows = [
        makeTask('focus', { isFocusTask: true, estimatedTimeMinutes: 180 }),
      ];
      const { service } = buildService(rows); // default breaks apply
      const plan = await service.generateDailyPlan(USER_ID, { date: DATE });

      const breaks = allItems(plan).filter((item) => item.type === 'break');
      expect(breaks.length).toBeGreaterThan(0);
      expect(
        breaks.some((item) => /work block/i.test(item.rationale ?? '')),
      ).toBe(true);
    });
  });

  describe('AI-first ordering', () => {
    it('honors the AI reasoning order and tags the plan as ai', async () => {
      const rows = [makeTask('first'), makeTask('second')];
      const { service, reasoning } = buildService(rows);
      jest.spyOn(reasoning, 'rankWithAI').mockResolvedValue({
        source: 'ai',
        summary: 'AI ordered plan.',
        order: [
          { taskId: 'second', rationale: 'AI put this first.' },
          { taskId: 'first', rationale: 'AI put this second.' },
        ],
      });

      const plan = await service.generateDailyPlan(USER_ID, {
        date: DATE,
        breaks: [],
      });

      expect(plan.source).toBe('ai');
      const items = taskItems(plan);
      expect(items[0].taskId).toBe('second');
      expect(items[0].rationale).toBe('AI put this first.');
    });
  });

  describe('completed tasks excluded', () => {
    it('never schedules a task with status done', async () => {
      const rows = [
        makeTask('done-one', { status: 'done' }),
        makeTask('todo-one'),
      ];
      const { service } = buildService(rows);
      const plan = await service.generateDailyPlan(USER_ID, {
        date: DATE,
        breaks: [],
      });

      expect(allItems(plan).some((item) => item.taskId === 'done-one')).toBe(
        false,
      );
      expect(plan.unscheduled.some((item) => item.taskId === 'done-one')).toBe(
        false,
      );
    });
  });

  /* ---- preference-driven scheduling ------------------------------------- */

  describe('preferences: focus hours', () => {
    it('places focus work at the start of the preferred focus window', async () => {
      const rows = [
        makeTask('deep', { isFocusTask: true, estimatedTimeMinutes: 60 }),
      ];
      const { service, preferences } = buildService(rows);
      jest
        .spyOn(preferences, 'getPreferences')
        .mockResolvedValue(
          withPreferences({ focusStartTime: '09:00', focusEndTime: '11:00' }),
        );

      const plan = await service.generateDailyPlan(USER_ID, {
        date: DATE,
        breaks: [],
      });
      const deep = taskItems(plan).find((item) => item.taskId === 'deep');

      expect(deep).toBeDefined();
      expect(toMin(deep!.startTime)).toBeGreaterThanOrEqual(toMin('09:00'));
      expect(toMin(deep!.endTime)).toBeLessThanOrEqual(toMin('11:00'));
    });
  });

  describe('preferences: break duration', () => {
    it('uses the preferred break length between split work blocks', async () => {
      const rows = [makeTask('long', { estimatedTimeMinutes: 90 })];
      const { service, preferences } = buildService(rows);
      jest
        .spyOn(preferences, 'getPreferences')
        .mockResolvedValue(
          withPreferences({ workBlockMinutes: 30, breakMinutes: 20 }),
        );

      const plan = await service.generateDailyPlan(USER_ID, {
        date: DATE,
        breaks: [],
      });
      const breaks = allItems(plan).filter((item) => item.type === 'break');

      expect(breaks.some((item) => item.durationMinutes === 20)).toBe(true);
    });
  });

  describe('preferences: finish started tasks first', () => {
    it('schedules a started task before a higher-priority fresh task when enabled', async () => {
      const rows = [
        makeTask('fresh', { priority: 'high' }),
        makeTask('started', {
          priority: 'low',
          progress: 40,
          spentTimeMinutes: 30,
        }),
      ];
      const { service, preferences } = buildService(rows);
      jest
        .spyOn(preferences, 'getPreferences')
        .mockResolvedValue(withPreferences({ finishStartedFirst: true }));

      const plan = await service.generateDailyPlan(USER_ID, {
        date: DATE,
        breaks: [],
      });
      expect(taskItems(plan)[0].taskId).toBe('started');
    });

    it('does not reorder for started tasks when the preference is disabled', async () => {
      const rows = [
        makeTask('fresh', { priority: 'high' }),
        makeTask('started', {
          priority: 'low',
          progress: 40,
          spentTimeMinutes: 30,
        }),
      ];
      const { service, preferences } = buildService(rows);
      jest
        .spyOn(preferences, 'getPreferences')
        .mockResolvedValue(withPreferences({ finishStartedFirst: false }));

      const plan = await service.generateDailyPlan(USER_ID, {
        date: DATE,
        breaks: [],
      });
      expect(taskItems(plan)[0].taskId).toBe('fresh');
    });
  });

  /* ---- capacity, current time & duration estimation --------------------- */

  describe('capacity summary', () => {
    it('always reports a capacity block (available/requested/scheduled/postponed)', async () => {
      const rows = [makeTask('a', { estimatedTimeMinutes: 60 })];
      const { service } = buildService(rows);
      const plan = await service.generateDailyPlan(USER_ID, {
        date: DATE,
        breaks: [],
      });

      expect(plan.capacity).toBeDefined();
      expect(plan.capacity.availableMinutes).toBeGreaterThan(0);
      expect(plan.capacity.requestedMinutes).toBe(60);
      expect(plan.capacity.scheduledMinutes).toBe(60);
      expect(plan.capacity.postponedMinutes).toBe(0);
      expect(plan.capacity.scheduledTaskCount).toBe(1);
    });
  });

  describe('daily capacity: smart postponement', () => {
    it('postpones the lowest-priority work when the day exceeds max daily work hours', async () => {
      const rows = [
        makeTask('big-a', { priority: 'high', estimatedTimeMinutes: 120 }),
        makeTask('big-b', { priority: 'medium', estimatedTimeMinutes: 120 }),
        makeTask('big-c', { priority: 'low', estimatedTimeMinutes: 120 }),
      ];
      const { service, preferences } = buildService(rows);
      // Only ~3h of real work allowed today; 6h requested.
      jest
        .spyOn(preferences, 'getPreferences')
        .mockResolvedValue(
          withPreferences({
            maxDailyWorkMinutes: 180,
            emergencyBufferMinutes: 30,
          }),
        );

      const plan = await service.generateDailyPlan(USER_ID, {
        date: DATE,
        breaks: [],
      });
      const postponed = plan.unscheduled.filter(
        (item) => item.status === 'POSTPONED_CAPACITY',
      );

      expect(postponed.length).toBeGreaterThan(0);
      // The low-priority task is the one pushed to a later day.
      expect(postponed.some((item) => item.taskId === 'big-c')).toBe(true);
      expect(postponed[0].suggestedDate).toBeDefined();
      expect(plan.capacity.postponedMinutes).toBeGreaterThan(0);
      expect(plan.capacity.availableMinutes).toBeLessThanOrEqual(180);
    });
  });

  describe('respects the current time when planning today', () => {
    it('never schedules a task before the current time', async () => {
      const today = new Date().toISOString().slice(0, 10);
      const rows = [makeTask('a', { estimatedTimeMinutes: 45 })];
      const { service } = buildService(rows);
      const plan = await service.generateDailyPlan(USER_ID, {
        date: today,
        currentTime: '15:00',
        breaks: [],
      });

      for (const item of taskItems(plan)) {
        expect(toMin(item.startTime)).toBeGreaterThanOrEqual(toMin('15:00'));
      }
    });
  });

  describe('duration estimation', () => {
    it('estimates a realistic duration for a task with no set duration', async () => {
      const rows = [
        makeTask('errand', {
          title: 'Buy groceries',
          estimatedTimeMinutes: 0,
          remainingTimeMinutes: 0,
        }),
      ];
      const { service } = buildService(rows);
      const plan = await service.generateDailyPlan(USER_ID, {
        date: DATE,
        breaks: [],
      });

      const item = taskItems(plan).find((entry) => entry.taskId === 'errand');
      expect(item).toBeDefined();
      // Not the old fixed 45-min default: an errand is estimated shorter.
      expect(item!.durationMinutes).toBeGreaterThan(0);
      expect(item!.durationMinutes).toBeLessThan(45);
    });
  });

  describe('preferences: group similar tasks', () => {
    it('clusters same-category tasks together when enabled', async () => {
      const rows = [
        makeTask('a', { category: 'Code', estimatedTimeMinutes: 30 }),
        makeTask('b', { category: 'Email', estimatedTimeMinutes: 30 }),
        makeTask('c', { category: 'Code', estimatedTimeMinutes: 30 }),
      ];
      const { service, preferences } = buildService(rows);
      jest
        .spyOn(preferences, 'getPreferences')
        .mockResolvedValue(withPreferences({ groupSimilarTasks: true }));

      const plan = await service.generateDailyPlan(USER_ID, {
        date: DATE,
        breaks: [],
      });
      const categories = taskItems(plan).map((item) => item.category);

      // The two "Code" tasks must be adjacent (no "Email" between them).
      expect(categories).toEqual(['Code', 'Code', 'Email']);
    });
  });
});
