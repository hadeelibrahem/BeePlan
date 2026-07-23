import { ConfigService } from '@nestjs/config';
import { RecurringCommitmentsService } from '../context/recurring-commitments.service';
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
  subtaskDependencies,
  subtasks,
  taskDependencies,
  taskMembers,
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

let subtaskSeq = 0;

function makeSubtask(
  taskId: string,
  overrides: Overrides = {},
): Record<string, unknown> {
  const id = (overrides.id as string) ?? `subtask-${(subtaskSeq += 1)}`;
  return {
    id,
    taskId,
    title: `Subtask ${id}`,
    isDone: false,
    orderIndex: 0,
    assignee: null,
    assigneeUserId: null,
    isShared: false,
    isFocusTask: false,
    description: null,
    priority: 'medium',
    status: 'todo',
    startDate: null,
    dueDate: null,
    estimatedDurationMinutes: 60,
    actualDurationMinutes: null,
    estimatedDurationSource: 'user',
    reminderEnabled: false,
    reminderMinutesBeforeDue: null,
    reminderTime: null,
    reminderSentAt: null,
    reminderStatus: 'none',
    notes: null,
    tags: null,
    completedAt: null,
    source: null,
    sourcePlanId: null,
    sourceProposalId: null,
    semanticType: null,
    subjectKeys: null,
    sharedSessionGroupId: null,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    ...overrides,
  };
}

const OTHER_USER_ID = '22222222-2222-2222-2222-222222222222';

/** A task_members row — its mere presence marks the parent task as shared. */
function makeMember(
  taskId: string,
  overrides: Overrides = {},
): Record<string, unknown> {
  return {
    id: `member-${taskId}`,
    taskId,
    userId: OTHER_USER_ID,
    role: 'editor',
    status: 'accepted',
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
  subtaskRows: unknown[],
  subtaskDepRows: unknown[],
  memberRows: unknown[],
) {
  return {
    select: jest.fn(() => ({
      from: (table: unknown) => {
        if (table === tasks) return query(taskRows);
        if (table === reminders) return query(reminderRows);
        if (table === taskDependencies) return query(depRows);
        if (table === plannerPreferences) return query(prefRows);
        if (table === subtasks) return query(subtaskRows);
        if (table === subtaskDependencies) return query(subtaskDepRows);
        if (table === taskMembers) return query(memberRows);
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
  subtaskRows: unknown[] = [],
  subtaskDepRows: unknown[] = [],
  memberRows: unknown[] = [],
) {
  const db = makeDb(
    taskRows,
    reminderRows,
    depRows,
    prefRows,
    subtaskRows,
    subtaskDepRows,
    memberRows,
  );
  const config = { get: () => undefined } as unknown as ConfigService; // no AI keys -> deterministic
  const reasoning = new PlannerReasoningEngine(config);
  const preferences = new PlannerPreferencesService({
    db,
  } as unknown as DatabaseService);
  const commitments = {
    getBusyWindowsForDate: jest.fn().mockResolvedValue([]),
  };
  const service = new AiPlannerService(
    { db } as unknown as DatabaseService,
    new PlannerRuleEngine(),
    reasoning,
    new PlannerSchedulerEngine(),
    new PlannerDurationEstimator(config),
    preferences,
    config,
    commitments as unknown as RecurringCommitmentsService,
  );
  return { service, reasoning, preferences, commitments };
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

  describe('recurring commitments as hard busy blocks', () => {
    it('renders the commitment and never schedules a task over it', async () => {
      const { service, commitments } = buildService([makeTask('a')]);
      // University Classes 08:00–11:00 on the plan date.
      commitments.getBusyWindowsForDate.mockResolvedValue([
        {
          commitmentId: 'c1',
          title: 'University Classes',
          start: '08:00',
          end: '11:00',
          placeName: 'University',
        },
      ]);

      const plan = await service.generateDailyPlan(USER_ID, {
        date: DATE,
        breaks: [],
      });

      expect(commitments.getBusyWindowsForDate).toHaveBeenCalledWith(USER_ID, DATE);

      // The commitment appears on the timeline as a calendar block.
      const commitmentItem = allItems(plan).find(
        (item) => item.type === 'calendar' && item.title.includes('University Classes'),
      );
      expect(commitmentItem).toBeDefined();
      expect(commitmentItem?.startTime).toBe('08:00');
      expect(commitmentItem?.endTime).toBe('11:00');

      // No task overlaps the 08:00–11:00 commitment window.
      const busyStart = toMin('08:00');
      const busyEnd = toMin('11:00');
      for (const task of taskItems(plan)) {
        const overlaps =
          toMin(task.startTime) < busyEnd && toMin(task.endTime) > busyStart;
        expect(overlaps).toBe(false);
      }
    });

    it('schedules around a large commitment and postpones the overflow instead of overlapping', async () => {
      // A 10-hour task cannot fully fit around an all-day commitment
      // (08:00–20:00) inside 08:00–21:00 working hours. Whatever fits goes in the
      // free gap; the overflow is postponed with a reason — nothing overlaps the
      // commitment.
      const { service, commitments } = buildService([
        makeTask('big', { estimatedTimeMinutes: 600 }),
      ]);
      commitments.getBusyWindowsForDate.mockResolvedValue([
        {
          commitmentId: 'c1',
          title: 'All-day event',
          start: '08:00',
          end: '20:00',
          placeName: null,
        },
      ]);

      const plan = await service.generateDailyPlan(USER_ID, {
        date: DATE,
        breaks: [],
      });

      // No scheduled task segment overlaps the 08:00–20:00 commitment window.
      const busyStart = toMin('08:00');
      const busyEnd = toMin('20:00');
      for (const task of taskItems(plan)) {
        const overlaps =
          toMin(task.startTime) < busyEnd && toMin(task.endTime) > busyStart;
        expect(overlaps).toBe(false);
      }

      // The task's overflow is postponed with an explanation.
      const unscheduled = plan.unscheduled.find((item) => item.taskId === 'big');
      expect(unscheduled).toBeDefined();
      expect(unscheduled?.reason.length ?? 0).toBeGreaterThan(0);
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

  /* ---- subtask-level scheduling ----------------------------------------- */

  describe('subtask-level scheduling', () => {
    // A parent whose incomplete subtasks are its schedulable work. The parent
    // duration (35) deliberately differs from the subtasks' total (3 × 60).
    const MIDTERM = 'ai-midterm';
    function midtermParent(overrides: Overrides = {}) {
      return makeTask(MIDTERM, {
        title: 'AI Midterm Exam Preparation',
        estimatedTimeMinutes: 35,
        remainingTimeMinutes: 35,
        ...overrides,
      });
    }
    function eveningFocus(overrides: Partial<PlannerPreferences> = {}) {
      return withPreferences({
        focusStartTime: '20:00',
        focusEndTime: '23:00',
        emergencyBufferMinutes: 0,
        ...overrides,
      });
    }
    // Restrict the plannable day to the evening focus window so "fill the focus
    // window, then postpone" is observable (otherwise the wide-open day would
    // absorb every subtask elsewhere).
    const EVENING_REQUEST = { date: DATE, breaks: [], workingHours: { start: '20:00' } };

    it('schedules the incomplete subtasks in place of the parent task', async () => {
      const subs = [
        makeSubtask(MIDTERM, { id: 's1', orderIndex: 0 }),
        makeSubtask(MIDTERM, { id: 's2', orderIndex: 1 }),
        makeSubtask(MIDTERM, { id: 's3', orderIndex: 2 }),
      ];
      const { service } = buildService([midtermParent()], [], [], [], subs);
      const plan = await service.generateDailyPlan(USER_ID, { date: DATE, breaks: [] });

      const items = taskItems(plan);
      expect(items.length).toBeGreaterThan(0);
      // Every scheduled task item is a subtask — never the bare parent.
      expect(items.every((item) => item.taskId === MIDTERM && Boolean(item.subtaskId))).toBe(true);
      const scheduledSubtaskIds = new Set(items.map((item) => item.subtaskId));
      expect(scheduledSubtaskIds.size).toBeGreaterThanOrEqual(2);
      // No single 35-minute parent block.
      expect(items.some((item) => item.subtaskId === undefined)).toBe(false);
    });

    it('requests the sum of subtask remaining durations, not the parent duration', async () => {
      const subs = [
        makeSubtask(MIDTERM, { id: 's1', estimatedDurationMinutes: 60 }),
        makeSubtask(MIDTERM, { id: 's2', estimatedDurationMinutes: 60 }),
        makeSubtask(MIDTERM, { id: 's3', estimatedDurationMinutes: 60 }),
      ];
      const { service } = buildService([midtermParent()], [], [], [], subs);
      const plan = await service.generateDailyPlan(USER_ID, { date: DATE, breaks: [] });

      // 3 × 60 = 180, not the parent's 35.
      expect(plan.capacity.requestedMinutes).toBe(180);
    });

    it('returns only subtasks as candidates — the parent is never scheduled or postponed on its own', async () => {
      const subs = [
        makeSubtask(MIDTERM, { id: 's1' }),
        makeSubtask(MIDTERM, { id: 's2' }),
      ];
      const { service, preferences } = buildService([midtermParent()], [], [], [], subs);
      jest.spyOn(preferences, 'getPreferences').mockResolvedValue(eveningFocus());

      const plan = await service.generateDailyPlan(USER_ID, EVENING_REQUEST);

      const scheduledParentOnly = allItems(plan)
        .filter((item) => item.type === 'task')
        .filter((item) => item.taskId === MIDTERM && !item.subtaskId);
      const postponedParentOnly = plan.unscheduled.filter(
        (entry) => entry.taskId === MIDTERM && !entry.subtaskId,
      );
      expect(scheduledParentOnly).toHaveLength(0);
      expect(postponedParentOnly).toHaveLength(0);
    });

    it('fills the focus window using multiple subtasks before postponing the rest', async () => {
      const subs = [1, 2, 3, 4, 5].map((n) =>
        makeSubtask(MIDTERM, { id: `s${n}`, orderIndex: n, estimatedDurationMinutes: 45 }),
      );
      const { service, preferences } = buildService([midtermParent()], [], [], [], subs);
      jest.spyOn(preferences, 'getPreferences').mockResolvedValue(eveningFocus());

      const plan = await service.generateDailyPlan(USER_ID, EVENING_REQUEST);
      const scheduled = taskItems(plan);

      // The 3-hour window (20:00–23:00) holds four 45-min subtasks.
      expect(scheduled.length).toBeGreaterThanOrEqual(4);
      for (const item of scheduled) {
        expect(toMin(item.startTime)).toBeGreaterThanOrEqual(toMin('20:00'));
        expect(toMin(item.endTime)).toBeLessThanOrEqual(toMin('23:00'));
      }
      // The fifth subtask is postponed with its real identity intact.
      const postponed = plan.unscheduled.filter((entry) => entry.subtaskId);
      expect(postponed.length).toBeGreaterThanOrEqual(1);
      expect(postponed[0].taskId).toBe(MIDTERM);
      expect(postponed[0].title).toMatch(/^Subtask s\d$/);
      expect(postponed[0].estimatedMinutes).toBeGreaterThan(0);
    });

    it('schedules a dependent subtask after the sibling it depends on', async () => {
      // B (high priority) depends on A (low priority); ordering must win over rank.
      const subs = [
        makeSubtask(MIDTERM, { id: 'A', orderIndex: 1, priority: 'low', estimatedDurationMinutes: 30 }),
        makeSubtask(MIDTERM, { id: 'B', orderIndex: 0, priority: 'high', estimatedDurationMinutes: 30 }),
      ];
      const deps = [{ subtaskId: 'B', dependsOnSubtaskId: 'A', createdAt: new Date() }];
      const { service } = buildService([midtermParent()], [], [], [], subs, deps);
      const plan = await service.generateDailyPlan(USER_ID, { date: DATE, breaks: [] });

      const items = taskItems(plan);
      const a = items.find((item) => item.subtaskId === 'A');
      const b = items.find((item) => item.subtaskId === 'B');
      expect(a).toBeDefined();
      expect(b).toBeDefined();
      expect(toMin(a!.startTime)).toBeLessThan(toMin(b!.startTime));
    });

    it('never schedules a parent alongside its subtasks, and ignores completed subtasks', async () => {
      const subs = [
        makeSubtask(MIDTERM, { id: 'open', isDone: false }),
        makeSubtask(MIDTERM, { id: 'closed', isDone: true, status: 'done' }),
      ];
      const { service } = buildService([midtermParent()], [], [], [], subs);
      const plan = await service.generateDailyPlan(USER_ID, { date: DATE, breaks: [] });

      const items = allItems(plan).filter((item) => item.type === 'task');
      expect(items.some((item) => item.subtaskId === 'open')).toBe(true);
      expect(items.some((item) => item.subtaskId === 'closed')).toBe(false);
      // The parent itself never appears as a schedulable block.
      expect(items.some((item) => item.taskId === MIDTERM && !item.subtaskId)).toBe(false);
    });

    it('keeps postponed subtasks as distinct rows instead of collapsing to duplicate parent entries', async () => {
      const subs = [
        makeSubtask(MIDTERM, { id: 's1', orderIndex: 0, estimatedDurationMinutes: 60 }),
        makeSubtask(MIDTERM, { id: 's2', orderIndex: 1, estimatedDurationMinutes: 60 }),
        makeSubtask(MIDTERM, { id: 's3', orderIndex: 2, estimatedDurationMinutes: 60 }),
      ];
      const { service, preferences } = buildService([midtermParent()], [], [], [], subs);
      // Only ~1 hour of real work allowed — two subtasks must be postponed.
      jest
        .spyOn(preferences, 'getPreferences')
        .mockResolvedValue(eveningFocus({ maxDailyWorkMinutes: 60 }));

      const plan = await service.generateDailyPlan(USER_ID, EVENING_REQUEST);
      const postponed = plan.unscheduled.filter((entry) => entry.taskId === MIDTERM);

      expect(postponed.length).toBeGreaterThanOrEqual(2);
      const ids = postponed.map((entry) => entry.subtaskId);
      expect(new Set(ids).size).toBe(ids.length); // all distinct
      expect(ids.every((id) => Boolean(id))).toBe(true); // every row keeps a real subtask id
    });

    it('still schedules a task that has no subtasks as a single parent block', async () => {
      const { service } = buildService([makeTask('plain', { estimatedTimeMinutes: 60 })]);
      const plan = await service.generateDailyPlan(USER_ID, { date: DATE, breaks: [] });

      const items = taskItems(plan);
      expect(items.some((item) => item.taskId === 'plain' && !item.subtaskId)).toBe(true);
    });

    it('prefers focus subtasks but still schedules eligible non-focus subtasks', async () => {
      const subs = [
        makeSubtask(MIDTERM, { id: 'focus', orderIndex: 0, isFocusTask: true, estimatedDurationMinutes: 45 }),
        makeSubtask(MIDTERM, { id: 'plain', orderIndex: 1, isFocusTask: false, estimatedDurationMinutes: 45 }),
      ];
      const { service, preferences } = buildService([midtermParent()], [], [], [], subs);
      jest.spyOn(preferences, 'getPreferences').mockResolvedValue(eveningFocus());

      const plan = await service.generateDailyPlan(USER_ID, EVENING_REQUEST);
      const items = taskItems(plan);
      const focus = items.find((item) => item.subtaskId === 'focus');
      const plain = items.find((item) => item.subtaskId === 'plain');

      // Focus subtask preferred first, but the non-focus one is not dropped.
      expect(focus).toBeDefined();
      expect(plain).toBeDefined();
      expect(toMin(focus!.startTime)).toBeLessThan(toMin(plain!.startTime));
    });

    it('schedules non-focus subtasks when a parent has none marked for focus (fallback)', async () => {
      const subs = [
        makeSubtask(MIDTERM, { id: 'n1', isFocusTask: false, estimatedDurationMinutes: 45 }),
        makeSubtask(MIDTERM, { id: 'n2', isFocusTask: false, estimatedDurationMinutes: 45 }),
      ];
      const { service, preferences } = buildService([midtermParent()], [], [], [], subs);
      jest.spyOn(preferences, 'getPreferences').mockResolvedValue(eveningFocus());

      const plan = await service.generateDailyPlan(USER_ID, EVENING_REQUEST);
      const items = taskItems(plan);
      // The focus window is filled by eligible subtasks even though none is a focus task.
      expect(items.filter((item) => item.subtaskId).length).toBeGreaterThanOrEqual(2);
    });

    it('subtracts logged focus-session time from a subtask remaining duration', async () => {
      const subs = [
        makeSubtask(MIDTERM, {
          id: 'partly-done',
          estimatedDurationMinutes: 120,
          actualDurationMinutes: 30, // 30 min already spent in completed focus sessions
        }),
      ];
      const { service } = buildService([midtermParent()], [], [], [], subs);
      const plan = await service.generateDailyPlan(USER_ID, { date: DATE, breaks: [] });

      // 120 estimate − 30 spent = 90 remaining requested and scheduled.
      expect(plan.capacity.requestedMinutes).toBe(90);
      const scheduledMinutes = taskItems(plan)
        .filter((item) => item.subtaskId === 'partly-done')
        .reduce((sum, item) => sum + item.durationMinutes, 0);
      expect(scheduledMinutes).toBe(90);
    });

    it('respects manual spent time (remaining) for a parent task without subtasks', async () => {
      // remainingTimeMinutes reflects the manual-spent bookkeeping (estimate − spent).
      const { service } = buildService([
        makeTask('manual', { estimatedTimeMinutes: 120, remainingTimeMinutes: 45, spentTimeMinutes: 75 }),
      ]);
      const plan = await service.generateDailyPlan(USER_ID, { date: DATE, breaks: [] });

      expect(plan.capacity.requestedMinutes).toBe(45);
    });
  });

  /* ---- shared-task assignment filtering --------------------------------- */

  describe('shared-task subtask assignment filtering', () => {
    const SHARED = 'shared-task';
    // The current user owns the task (tasks.userId === USER_ID); a task_members
    // row makes it shared, so assignment filtering applies.
    function sharedParent(overrides: Overrides = {}) {
      return makeTask(SHARED, {
        title: 'Group Project',
        estimatedTimeMinutes: 40,
        remainingTimeMinutes: 40,
        ...overrides,
      });
    }
    const MEMBERS = [makeMember(SHARED)];

    /** Every subtask id that shows up anywhere in the plan (scheduled or not). */
    function planSubtaskIds(plan: DailyPlan): Set<string> {
      const scheduled = allItems(plan)
        .filter((item) => item.type === 'task')
        .map((item) => item.subtaskId);
      const postponed = plan.unscheduled.map((entry) => entry.subtaskId);
      return new Set([...scheduled, ...postponed].filter(Boolean) as string[]);
    }

    it('never schedules another user\'s subtask', async () => {
      const subs = [
        makeSubtask(SHARED, { id: 'A', assigneeUserId: USER_ID }),
        makeSubtask(SHARED, { id: 'B', assigneeUserId: OTHER_USER_ID }),
      ];
      const { service } = buildService([sharedParent()], [], [], [], subs, [], MEMBERS);
      const plan = await service.generateDailyPlan(USER_ID, { date: DATE, breaks: [] });

      const scheduled = allItems(plan).filter((item) => item.type === 'task');
      expect(scheduled.some((item) => item.subtaskId === 'A')).toBe(true);
      expect(scheduled.some((item) => item.subtaskId === 'B')).toBe(false);
    });

    it('never postpones another user\'s subtask', async () => {
      const subs = [
        makeSubtask(SHARED, { id: 'A', assigneeUserId: USER_ID, estimatedDurationMinutes: 60 }),
        makeSubtask(SHARED, { id: 'B', assigneeUserId: OTHER_USER_ID, estimatedDurationMinutes: 600 }),
        makeSubtask(SHARED, { id: 'C', assigneeUserId: USER_ID, estimatedDurationMinutes: 600 }),
      ];
      const { service, preferences } = buildService([sharedParent()], [], [], [], subs, [], MEMBERS);
      // Tight budget so some of the current user's own work is postponed.
      jest
        .spyOn(preferences, 'getPreferences')
        .mockResolvedValue(withPreferences({ maxDailyWorkMinutes: 60, emergencyBufferMinutes: 0 }));

      const plan = await service.generateDailyPlan(USER_ID, { date: DATE, breaks: [] });
      expect(plan.unscheduled.some((entry) => entry.subtaskId === 'B')).toBe(false);
      // B contributes nothing at all — never scheduled either.
      expect(planSubtaskIds(plan).has('B')).toBe(false);
    });

    it('excludes another user\'s subtask from requested minutes', async () => {
      const subs = [
        makeSubtask(SHARED, { id: 'A', assigneeUserId: USER_ID, estimatedDurationMinutes: 60 }),
        makeSubtask(SHARED, { id: 'B', assigneeUserId: OTHER_USER_ID, estimatedDurationMinutes: 120 }),
      ];
      const { service } = buildService([sharedParent()], [], [], [], subs, [], MEMBERS);
      const plan = await service.generateDailyPlan(USER_ID, { date: DATE, breaks: [] });

      // Only A's 60 min — never B's 120, never the parent's 40.
      expect(plan.capacity.requestedMinutes).toBe(60);
    });

    it('excludes another user\'s subtask from capacity and postponed minutes', async () => {
      const subs = [
        makeSubtask(SHARED, { id: 'A', assigneeUserId: USER_ID, estimatedDurationMinutes: 60 }),
        makeSubtask(SHARED, { id: 'B', assigneeUserId: OTHER_USER_ID, estimatedDurationMinutes: 600 }),
      ];
      const { service } = buildService([sharedParent()], [], [], [], subs, [], MEMBERS);
      const plan = await service.generateDailyPlan(USER_ID, { date: DATE, breaks: [] });

      // A fits comfortably; B's huge duration must not create any postponement.
      expect(plan.capacity.scheduledMinutes).toBe(60);
      expect(plan.capacity.postponedMinutes).toBe(0);
      expect(plan.capacity.postponedTaskCount).toBe(0);
    });

    it('does not fall back to the shared parent when no subtask belongs to the current user', async () => {
      const subs = [
        makeSubtask(SHARED, { id: 'B', assigneeUserId: OTHER_USER_ID }),
        makeSubtask(SHARED, { id: 'C', assigneeUserId: null }), // unassigned
      ];
      const { service } = buildService([sharedParent()], [], [], [], subs, [], MEMBERS);
      const plan = await service.generateDailyPlan(USER_ID, { date: DATE, breaks: [] });

      // The parent must not be scheduled or postponed as a stand-in.
      expect(allItems(plan).some((item) => item.taskId === SHARED)).toBe(false);
      expect(plan.unscheduled.some((entry) => entry.taskId === SHARED)).toBe(false);
      // The shared task contributes zero requested minutes for this user.
      expect(plan.capacity.requestedMinutes).toBe(0);
    });

    it('schedules the current user\'s assigned subtask normally', async () => {
      const subs = [makeSubtask(SHARED, { id: 'A', assigneeUserId: USER_ID })];
      const { service } = buildService([sharedParent()], [], [], [], subs, [], MEMBERS);
      const plan = await service.generateDailyPlan(USER_ID, { date: DATE, breaks: [] });

      expect(taskItems(plan).some((item) => item.subtaskId === 'A')).toBe(true);
    });

    it('returns only the current user\'s units for a mixed-assignee shared task', async () => {
      const subs = [
        makeSubtask(SHARED, { id: 'A', assigneeUserId: USER_ID }),
        makeSubtask(SHARED, { id: 'B', assigneeUserId: OTHER_USER_ID }),
        makeSubtask(SHARED, { id: 'C', assigneeUserId: null }),
      ];
      const { service } = buildService([sharedParent()], [], [], [], subs, [], MEMBERS);
      const plan = await service.generateDailyPlan(USER_ID, { date: DATE, breaks: [] });

      expect([...planSubtaskIds(plan)].sort()).toEqual(['A']);
    });

    it('excludes an unassigned subtask on a shared task (assignment ownership rule)', async () => {
      const subs = [
        makeSubtask(SHARED, { id: 'A', assigneeUserId: USER_ID }),
        makeSubtask(SHARED, { id: 'C', assigneeUserId: null }),
      ];
      const { service } = buildService([sharedParent()], [], [], [], subs, [], MEMBERS);
      const plan = await service.generateDailyPlan(USER_ID, { date: DATE, breaks: [] });

      expect(planSubtaskIds(plan).has('A')).toBe(true);
      expect(planSubtaskIds(plan).has('C')).toBe(false);
    });

    it('leaves a current-user subtask unscheduled when it depends on another user\'s unfinished subtask', async () => {
      const subs = [
        makeSubtask(SHARED, { id: 'A', assigneeUserId: USER_ID, estimatedDurationMinutes: 30 }),
        makeSubtask(SHARED, {
          id: 'B',
          assigneeUserId: OTHER_USER_ID,
          title: 'Confidential teammate work',
          estimatedDurationMinutes: 30,
        }),
      ];
      const deps = [{ subtaskId: 'A', dependsOnSubtaskId: 'B', createdAt: new Date() }];
      const { service } = buildService([sharedParent()], [], [], [], subs, deps, MEMBERS);
      const plan = await service.generateDailyPlan(USER_ID, { date: DATE, breaks: [] });

      // A is blocked (its dependency B belongs to another member and is unfinished).
      expect(taskItems(plan).some((item) => item.subtaskId === 'A')).toBe(false);
      const blocked = plan.unscheduled.find((entry) => entry.subtaskId === 'A');
      expect(blocked).toBeDefined();
      expect(blocked!.status).toBe('BLOCKED_DEPENDENCY');
      // Generic reason — never leaks the teammate's subtask title.
      expect(blocked!.reason.toLowerCase()).toContain('dependency');
      expect(blocked!.reason).not.toContain('Confidential');
      // B is never scheduled to unblock A.
      expect(planSubtaskIds(plan).has('B')).toBe(false);
    });

    it('leaks no foreign subtask id or title anywhere in the response', async () => {
      const subs = [
        makeSubtask(SHARED, { id: 'A', assigneeUserId: USER_ID }),
        makeSubtask(SHARED, {
          id: 'foreign-secret-id',
          assigneeUserId: OTHER_USER_ID,
          title: 'SECRET teammate subtask',
          estimatedDurationMinutes: 300,
        }),
      ];
      const { service } = buildService([sharedParent()], [], [], [], subs, [], MEMBERS);
      const plan = await service.generateDailyPlan(USER_ID, { date: DATE, breaks: [] });

      const serialized = JSON.stringify(plan);
      expect(serialized).not.toContain('foreign-secret-id');
      expect(serialized).not.toContain('SECRET teammate subtask');
      expect(serialized).not.toContain(OTHER_USER_ID);
    });

    it('keeps personal-task subtasks unchanged (no members → no assignment filter)', async () => {
      // A personal task's subtasks are unassigned but still all the owner's work.
      const subs = [
        makeSubtask('personal', { id: 'p1', assigneeUserId: null }),
        makeSubtask('personal', { id: 'p2', assigneeUserId: null }),
      ];
      const { service } = buildService(
        [makeTask('personal', { estimatedTimeMinutes: 30 })],
        [],
        [],
        [],
        subs,
        [],
        [], // no members → personal task
      );
      const plan = await service.generateDailyPlan(USER_ID, { date: DATE, breaks: [] });

      expect(planSubtaskIds(plan).has('p1')).toBe(true);
      expect(planSubtaskIds(plan).has('p2')).toBe(true);
    });

    it('filters by user id, not by assignee name/email text', async () => {
      const subs = [
        // Free-text name matches the current user, but the id points elsewhere → excluded.
        makeSubtask(SHARED, {
          id: 'name-trap',
          assignee: 'Current User',
          assigneeUserId: OTHER_USER_ID,
        }),
        // Id matches the current user even though the display name is someone else → included.
        makeSubtask(SHARED, {
          id: 'id-match',
          assignee: 'Somebody Else',
          assigneeUserId: USER_ID,
        }),
      ];
      const { service } = buildService([sharedParent()], [], [], [], subs, [], MEMBERS);
      const plan = await service.generateDailyPlan(USER_ID, { date: DATE, breaks: [] });

      expect(planSubtaskIds(plan).has('id-match')).toBe(true);
      expect(planSubtaskIds(plan).has('name-trap')).toBe(false);
    });
  });
});
