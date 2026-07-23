import { Injectable, Logger } from '@nestjs/common';
import { and, eq, inArray, ne } from 'drizzle-orm';
import { RecurringCommitmentsService } from '../context/recurring-commitments.service';
import { DatabaseService } from '../db/database.service';
import {
  reminders,
  subtaskDependencies,
  subtasks,
  taskDependencies,
  taskMembers,
  tasks,
} from '../db/schema';
import { isSubtaskOwnedByUser } from '../tasks/subtask-ownership';
import { PlannerAcceptanceService } from './planner/planner-acceptance.service';
import { PlannerDurationEstimator, type EstimatorResult } from './planner/planner-duration-estimator';
import { PlannerPreferencesService } from './planner/planner-preferences.service';
import { PlannerReasoningEngine } from './planner/planner-reasoning-engine';
import { PlannerRuleEngine, normalizePriority } from './planner/planner-rule-engine';
import { PlannerSchedulerEngine } from './planner/planner-scheduler-engine';
import {
  currentTimeString,
  isSameLocalDate,
  isTime,
  timeString,
  toMinutes,
} from './planner/planner.util';
import type {
  DailyPlan,
  PlannerContext,
  PlannerReminder,
  PlannerRequest,
  PlannerTask,
  ReasoningResult,
  WorkingHours,
} from './planner/planner.types';

// Re-export the public response types so existing importers keep working.
export type {
  DailyPlan,
  DailyPlanItem,
  UnscheduledItem,
} from './planner/planner.types';

type TaskRow = typeof tasks.$inferSelect;
type ReminderRow = typeof reminders.$inferSelect;
type DependencyRow = typeof taskDependencies.$inferSelect;
type SubtaskRow = typeof subtasks.$inferSelect;
type SubtaskDependencyRow = typeof subtaskDependencies.$inferSelect;

/**
 * A subtask counts toward its parent's schedulable work while it is neither
 * completed nor missed. When a task has at least one such subtask, the planner
 * schedules those subtasks in place of the parent task itself.
 */
function isSchedulableSubtask(row: SubtaskRow): boolean {
  return !row.isDone && row.status !== 'done' && row.status !== 'missed';
}

const DEFAULT_WORKING_HOURS: WorkingHours = { start: '08:00', end: '21:00' };
const DEFAULT_BREAKS = [
  { start: '10:30', end: '10:45', title: 'Short break' },
  { start: '13:30', end: '14:00', title: 'Lunch break' },
  { start: '16:00', end: '16:15', title: 'Reset break' },
];

/**
 * Orchestrates the 3-layer AI Planner pipeline:
 *
 *   1. Collect user context (tasks, reminders, dependencies, locks, time).
 *   2. Rule Engine       -> prepare hard constraints.
 *   3. Reasoning Engine  -> rank + explain tasks (AI-first, deterministic fallback).
 *   4. Scheduler Engine  -> lay decisions onto a real timeline.
 *   5. Rule Engine       -> validate the finished plan.
 *   6. On AI failure or an invalid plan -> rebuild with the deterministic path
 *      through the very same Scheduler + Rule pipeline.
 */
@Injectable()
export class AiPlannerService {
  private readonly logger = new Logger(AiPlannerService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly ruleEngine: PlannerRuleEngine,
    private readonly reasoningEngine: PlannerReasoningEngine,
    private readonly schedulerEngine: PlannerSchedulerEngine,
    private readonly durationEstimator: PlannerDurationEstimator,
    private readonly preferencesService: PlannerPreferencesService,
    private readonly acceptanceService: PlannerAcceptanceService,
    private readonly commitmentsService: RecurringCommitmentsService,
  ) {}

  async generateDailyPlan(userId: string, request: PlannerRequest = {}): Promise<DailyPlan> {
    // 1. Collect context.
    const context = await this.collectContext(userId, request);

    // 2. Rule Engine prepares constraints.
    const constraints = this.ruleEngine.prepareConstraints(context);

    // 3. Reasoning Engine ranks + explains (AI first, deterministic fallback).
    let source: 'ai' | 'fallback' = 'ai';
    let reasoning: ReasoningResult | null = await this.reasoningEngine.rankWithAI(context, constraints);
    if (!reasoning) {
      source = 'fallback';
      reasoning = this.reasoningEngine.rankDeterministic(context, constraints);
    }

    // 4. Scheduler Engine builds the timeline.
    let plan = this.schedulerEngine.build(reasoning, constraints, context, source);

    // 5. Rule Engine validates the finished plan.
    const issues = this.ruleEngine.validatePlan(plan, constraints);

    // 6. If the AI-driven plan is not realistic, rebuild deterministically
    //    through the same Scheduler + Rule pipeline.
    if (issues.length && source === 'ai') {
      this.logger.warn(`AI plan rejected (${issues.map((issue) => issue.code).join(', ')}); using deterministic plan.`);
      const fallbackReasoning = this.reasoningEngine.rankDeterministic(context, constraints);
      plan = this.schedulerEngine.build(fallbackReasoning, constraints, context, 'fallback');
    } else if (issues.length) {
      this.logger.warn(`Deterministic plan reported issues: ${issues.map((issue) => issue.message).join('; ')}`);
    }

    return plan;
  }

  /** Step 1 — gather everything the planner needs into a single context object. */
  private async collectContext(userId: string, request: PlannerRequest): Promise<PlannerContext> {
    const date = normalizeDate(request.date);
    const requestedHours = normalizeWorkingHours(request.workingHours);
    const breaks = request.breaks?.length ? request.breaks : DEFAULT_BREAKS;

    const [taskRows, reminderRows, dependencyRows, preferences, commitmentWindows] =
      await Promise.all([
        this.databaseService.db
          .select()
          .from(tasks)
          .where(and(eq(tasks.userId, userId), ne(tasks.status, 'done'))),
        this.databaseService.db
          .select()
          .from(reminders)
          .where(and(eq(reminders.userId, userId), ne(reminders.status, 'done'))),
        this.databaseService.db.select().from(taskDependencies),
        this.preferencesService.getPreferences(userId),
        // Active recurring commitments that fall on the plan date, already
        // reduced to hard busy intervals for the date's weekday.
        this.commitmentsService.getBusyWindowsForDate(userId, date),
      ]);

    // The focus window is a hard part of the user's availability: extend the
    // working day so it always covers their configured focus hours. Without
    // this an evening focus window (e.g. 20:00-23:00) would be silently clipped
    // to the default 21:00 day-end and most of it left unusable.
    const workingHours: WorkingHours = {
      start: requestedHours.start,
      end: laterTime(requestedHours.end, preferences.focusEndTime),
    };

    // Which of the loaded tasks are shared (collaborative). On a shared task a
    // subtask is only this user's work when it is assigned to them; on a purely
    // personal task every incomplete subtask is theirs.
    const sharedTaskIds = await this.loadSharedTaskIds(taskRows);

    // Expand each task into its schedulable work items. A task with incomplete
    // subtasks contributes those subtasks (never the parent); a task without any
    // contributes itself. This is what makes the planner schedule subtask-level
    // work instead of a single parent block. For shared tasks, foreign subtasks
    // are filtered out here — before estimation, dependencies, capacity and
    // postponement — so another member's work never enters this user's plan.
    const { subtasksByTask, subtaskById, subtaskDepRows } =
      await this.loadSubtaskData(taskRows);
    const units = buildPlanningUnits(taskRows, subtasksByTask, sharedTaskIds, userId);
    const unitSubtaskIds = new Set(
      units.flatMap((unit) => (unit.kind === 'subtask' ? [unit.subtask.id] : [])),
    );

    // Split each subtask's dependency edges into ordering constraints (the
    // dependency is one of THIS user's own candidates, so we just place it first)
    // and blocking constraints (the dependency is an incomplete subtask that is
    // NOT this user's candidate — e.g. another member's work — which must block
    // the dependent instead of being scheduled to unblock it).
    const { orderDepsBySubtask, blockingDepsBySubtask, blockingDepIds } =
      classifySubtaskDependencies(subtaskDepRows, subtaskById, unitSubtaskIds);

    // Estimate durations + classify work type for units with no set duration,
    // instead of falling back on a single fixed default. Known durations are
    // kept verbatim; only their type is classified. Task ids and subtask ids are
    // both UUIDs, so a single keyed map covers every unit without collision.
    const estimates = await this.durationEstimator.estimate(
      units.map((unit) =>
        unit.kind === 'task'
          ? {
              id: unit.task.id,
              title: unit.task.title,
              category: unit.task.category,
              isFocusTask: unit.task.isFocusTask,
              knownMinutes:
                unit.task.remainingTimeMinutes || unit.task.estimatedTimeMinutes || 0,
            }
          : {
              id: unit.subtask.id,
              title: unit.subtask.title,
              category: unit.task.category,
              isFocusTask: unit.subtask.isFocusTask,
              knownMinutes: unit.subtask.estimatedDurationMinutes ?? 0,
            },
      ),
    );

    const plannerTasks: PlannerTask[] = units.map((unit) =>
      unit.kind === 'task'
        ? toPlannerTask(unit.task, dependencyRows, estimates.get(unit.task.id))
        : toPlannerSubtask(
            unit.task,
            unit.subtask,
            dependencyRows,
            estimates.get(unit.subtask.id),
            orderDepsBySubtask.get(unit.subtask.id) ?? [],
            blockingDepsBySubtask.get(unit.subtask.id) ?? [],
          ),
    );

    return {
      userId,
      date,
      currentTime: request.currentTime ?? currentTimeString(),
      workingHours,
      breaks,
      lockedItems: request.lockedItems ?? [],
      tasks: plannerTasks,
      reminders: reminderRows.map((reminder) => toPlannerReminder(reminder, date)),
      commitments: commitmentWindows.map((window) => ({
        id: window.commitmentId,
        title: window.title,
        start: window.start,
        end: window.end,
        placeName: window.placeName,
      })),
      preferences,
      // Every incomplete parent task, plus any incomplete subtask that blocks one
      // of this user's candidates (e.g. another member's unfinished dependency),
      // so cross-task and cross-member dependencies both resolve to a block.
      activeTaskIds: new Set([...taskRows.map((task) => task.id), ...blockingDepIds]),
    };
  }

  /** The subset of the given tasks that are shared (have any task_members row). */
  private async loadSharedTaskIds(taskRows: TaskRow[]): Promise<Set<string>> {
    if (taskRows.length === 0) return new Set();
    const rows = await this.databaseService.db
      .select({ taskId: taskMembers.taskId })
      .from(taskMembers)
      .where(inArray(taskMembers.taskId, taskRows.map((task) => task.id)));
    return new Set(rows.map((row) => row.taskId));
  }

  /**
   * Loads all subtasks for the given tasks plus their intra-task dependency
   * edges. Returns them grouped by task, indexed by id, and the raw dependency
   * rows — dependency classification (ordering vs blocking) happens afterwards,
   * once the current user's schedulable candidate set is known.
   */
  private async loadSubtaskData(taskRows: TaskRow[]): Promise<{
    subtasksByTask: Map<string, SubtaskRow[]>;
    subtaskById: Map<string, SubtaskRow>;
    subtaskDepRows: SubtaskDependencyRow[];
  }> {
    const subtasksByTask = new Map<string, SubtaskRow[]>();
    const subtaskById = new Map<string, SubtaskRow>();
    if (taskRows.length === 0) {
      return { subtasksByTask, subtaskById, subtaskDepRows: [] };
    }

    const subtaskRows = await this.databaseService.db
      .select()
      .from(subtasks)
      .where(inArray(subtasks.taskId, taskRows.map((task) => task.id)));
    if (subtaskRows.length === 0) {
      return { subtasksByTask, subtaskById, subtaskDepRows: [] };
    }

    for (const row of subtaskRows) {
      subtaskById.set(row.id, row);
      const list = subtasksByTask.get(row.taskId);
      if (list) list.push(row);
      else subtasksByTask.set(row.taskId, [row]);
    }

    const subtaskDepRows: SubtaskDependencyRow[] = await this.databaseService.db
      .select()
      .from(subtaskDependencies)
      .where(inArray(subtaskDependencies.subtaskId, subtaskRows.map((row) => row.id)));

    return { subtasksByTask, subtaskById, subtaskDepRows };
  }

  /** Endpoints delegate here so the controller stays thin. */
  getPreferences(userId: string) {
    return this.preferencesService.getPreferences(userId);
  }

  savePreferences(userId: string, input: unknown) {
    return this.preferencesService.savePreferences(userId, input);
  }

  acceptPlan(userId: string, input: unknown) {
    return this.acceptanceService.acceptPlan(userId, input);
  }

  getAcceptance(userId: string, date: string) {
    return this.acceptanceService.getAcceptance(userId, normalizeDate(date));
  }
}

function normalizeDate(value?: string): string {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Date().toISOString().slice(0, 10);
}

function normalizeWorkingHours(value?: { start?: string; end?: string }): WorkingHours {
  return {
    start: isTime(value?.start) ? value.start : DEFAULT_WORKING_HOURS.start,
    end: isTime(value?.end) ? value.end : DEFAULT_WORKING_HOURS.end,
  };
}

/** A single unit of schedulable work: a whole task, or one of its subtasks. */
type PlanningUnit =
  | { kind: 'task'; task: TaskRow }
  | { kind: 'subtask'; task: TaskRow; subtask: SubtaskRow };

/**
 * Expand tasks into schedulable units for one user. A task with at least one
 * incomplete subtask contributes those subtasks (and NOT the parent task); a
 * task with no incomplete subtasks contributes itself.
 *
 * For a shared task the incomplete subtasks are first narrowed to the ones
 * assigned to this user. Crucially, once a task HAS incomplete subtask work, its
 * parent is never used as a fallback — so a shared task whose incomplete
 * subtasks all belong to other members contributes zero units for this user
 * (the parent can't be scheduled to bypass the assignment filter).
 */
function buildPlanningUnits(
  taskRows: TaskRow[],
  subtasksByTask: Map<string, SubtaskRow[]>,
  sharedTaskIds: Set<string>,
  userId: string,
): PlanningUnit[] {
  const units: PlanningUnit[] = [];
  for (const task of taskRows) {
    const incompleteSubtasks = (subtasksByTask.get(task.id) ?? []).filter(
      isSchedulableSubtask,
    );
    // No incomplete subtask work anywhere on this task → schedule the parent.
    if (incompleteSubtasks.length === 0) {
      units.push({ kind: 'task', task });
      continue;
    }
    // There IS incomplete subtask work: the parent is represented by subtasks
    // and must never be scheduled itself, even if this user owns none of them.
    const shared = sharedTaskIds.has(task.id);
    const mine = incompleteSubtasks
      .filter((subtask) => isSubtaskOwnedByUser(subtask, userId, shared))
      // Deterministic order: user order first, then a stable id tiebreak.
      .sort((a, b) => a.orderIndex - b.orderIndex || a.id.localeCompare(b.id));
    for (const subtask of mine) {
      units.push({ kind: 'subtask', task, subtask });
    }
  }
  return units;
}

/**
 * Classify each subtask's dependency edges relative to the current user's
 * schedulable candidate set (`unitSubtaskIds`):
 *   - the dependency is complete            → satisfied, ignored;
 *   - it is one of this user's candidates   → an ordering constraint only;
 *   - it is any other incomplete subtask    → a blocking constraint (e.g. another
 *     member's unfinished work) that must prevent the dependent from scheduling.
 *
 * `blockingDepIds` collects every incomplete dependency that blocks, so the rule
 * engine can recognise it as still-active without the blocking subtask ever
 * becoming a candidate (it is never scheduled to unblock the dependent).
 */
function classifySubtaskDependencies(
  depRows: SubtaskDependencyRow[],
  subtaskById: Map<string, SubtaskRow>,
  unitSubtaskIds: Set<string>,
): {
  orderDepsBySubtask: Map<string, string[]>;
  blockingDepsBySubtask: Map<string, string[]>;
  blockingDepIds: Set<string>;
} {
  const orderDepsBySubtask = new Map<string, string[]>();
  const blockingDepsBySubtask = new Map<string, string[]>();
  const blockingDepIds = new Set<string>();

  const push = (map: Map<string, string[]>, key: string, value: string) => {
    const list = map.get(key);
    if (list) list.push(value);
    else map.set(key, [value]);
  };

  for (const dep of depRows) {
    const dependsOn = subtaskById.get(dep.dependsOnSubtaskId);
    // A completed (or unknown) dependency is already satisfied.
    if (!dependsOn || !isSchedulableSubtask(dependsOn)) continue;
    if (unitSubtaskIds.has(dep.dependsOnSubtaskId)) {
      push(orderDepsBySubtask, dep.subtaskId, dep.dependsOnSubtaskId);
    } else {
      push(blockingDepsBySubtask, dep.subtaskId, dep.dependsOnSubtaskId);
      blockingDepIds.add(dep.dependsOnSubtaskId);
    }
  }

  return { orderDepsBySubtask, blockingDepsBySubtask, blockingDepIds };
}

function toPlannerTask(task: TaskRow, dependencyRows: DependencyRow[], estimate?: EstimatorResult): PlannerTask {
  const known = task.remainingTimeMinutes || task.estimatedTimeMinutes || 0;
  return {
    id: task.id,
    taskId: task.id,
    subtaskId: null,
    title: task.title,
    priority: normalizePriority(task.priority),
    status: task.status,
    dueDate: task.dueDate?.toISOString(),
    dueTime: task.dueTime,
    category: task.category,
    // Prefer the estimator's number (it echoes a known duration verbatim, or
    // estimates a realistic one); fall back to the stored value if estimation
    // was somehow unavailable for this task.
    estimatedMinutes: estimate?.minutes ?? known,
    durationEstimated: estimate?.estimated ?? false,
    durationConfidence: estimate?.confidence ?? 'medium',
    durationReason: estimate?.reason ?? '',
    taskType: estimate?.taskType ?? (task.isFocusTask ? 'deep' : 'light'),
    spentMinutes: task.spentTimeMinutes,
    progress: task.progress,
    isFocusTask: task.isFocusTask,
    updatedAt: task.updatedAt.toISOString(),
    dependencyTaskIds: dependencyRows.filter((row) => row.taskId === task.id).map((row) => row.dependencyTaskId),
    orderDependencyIds: [],
  };
}

/**
 * Build a schedulable candidate for one incomplete subtask. The remaining
 * duration subtracts time already logged against the subtask (its completed
 * Focus Sessions, cached in actualDurationMinutes) from its estimate, so the
 * planner never re-schedules work that is already done. Output linkage keeps the
 * parent task id while carrying the real subtask id + title.
 */
function toPlannerSubtask(
  task: TaskRow,
  subtask: SubtaskRow,
  dependencyRows: DependencyRow[],
  estimate: EstimatorResult | undefined,
  orderDependencyIds: string[],
  blockingDependencyIds: string[],
): PlannerTask {
  const knownEstimate = subtask.estimatedDurationMinutes ?? 0;
  const fullEstimate = estimate?.minutes ?? knownEstimate;
  const spent = Math.max(0, subtask.actualDurationMinutes ?? 0);
  const remaining = Math.max(0, fullEstimate - spent);
  const done = subtask.isDone || subtask.status === 'done';
  return {
    id: subtask.id,
    taskId: task.id,
    subtaskId: subtask.id,
    title: subtask.title,
    priority: normalizePriority(subtask.priority ?? task.priority),
    status: subtask.status,
    dueDate: (subtask.dueDate ?? task.dueDate)?.toISOString(),
    dueTime: task.dueTime,
    // Subtasks have no category of their own — inherit the parent's so energy
    // matching and "group similar tasks" keep working.
    category: task.category,
    estimatedMinutes: remaining,
    durationEstimated: estimate?.estimated ?? false,
    durationConfidence: estimate?.confidence ?? 'medium',
    durationReason: estimate?.reason ?? '',
    taskType: estimate?.taskType ?? (subtask.isFocusTask ? 'deep' : 'light'),
    spentMinutes: spent,
    progress: done ? 100 : subtask.status === 'in_progress' ? 50 : 0,
    isFocusTask: subtask.isFocusTask,
    updatedAt: subtask.updatedAt.toISOString(),
    // Cross-task dependencies live at the parent level and still apply to every
    // subtask of that parent. Blocking subtask dependencies (an incomplete
    // subtask that is not one of this user's candidates — e.g. another member's
    // work) are added here so the rule engine treats the dependent as blocked
    // rather than scheduling it before that work is done.
    dependencyTaskIds: [
      ...dependencyRows.filter((row) => row.taskId === task.id).map((row) => row.dependencyTaskId),
      ...blockingDependencyIds,
    ],
    orderDependencyIds,
  };
}

/** Returns the later of two HH:mm times, ignoring malformed inputs. */
function laterTime(a: string, b: string): string {
  if (!isTime(b)) return a;
  if (!isTime(a)) return b;
  return toMinutes(b) > toMinutes(a) ? b : a;
}

function toPlannerReminder(reminder: ReminderRow, date: string): PlannerReminder {
  const onDate = isSameLocalDate(reminder.triggerDateTime, date);
  return {
    id: reminder.id,
    title: reminder.title,
    priority: normalizePriority(reminder.priority),
    triggerDateTime: reminder.triggerDateTime?.toISOString(),
    startTime: onDate && reminder.triggerDateTime ? timeString(reminder.triggerDateTime) : undefined,
    type: reminder.type,
  };
}
