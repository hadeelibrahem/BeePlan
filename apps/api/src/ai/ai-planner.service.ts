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
  plannerDailySelections,
} from '../db/schema';
import { isSubtaskOwnedByUser } from '../tasks/subtask-ownership';
import { PlannerAcceptanceService } from './planner/planner-acceptance.service';
import { PlannerDurationEstimator, type EstimatorResult } from './planner/planner-duration-estimator';
import { PlannerPreferencesService } from './planner/planner-preferences.service';
import { PlannerReasoningEngine } from './planner/planner-reasoning-engine';
import { PlannerRuleEngine, normalizePriority } from './planner/planner-rule-engine';
import { PlannerSchedulerEngine } from './planner/planner-scheduler-engine';
import { detectScheduleConflicts } from './planner/schedule-conflicts';
import { findTaskTimeConflicts, type ScheduledTaskCandidate } from '../tasks/task-schedule-conflicts';
import {
  isTime,
  timeString,
  toMinutes,
  dateKeyInTimeZone,
  isAfterUserDay,
  timeStringInTimeZone,
} from './planner/planner.util';
import type {
  DailyPlan,
  PlannerContext,
  PlannerReminder,
  PlannerRequest,
  PlannerSelectionItem,
  PlannerTask,
  ReasoningResult,
  WorkingHours,
} from './planner/planner.types';
import { GeoapifyTravelProvider } from '../weather-travel/geoapify-travel.provider';
import { travelFeasibilityConflict } from '../weather-travel/travel-feasibility';

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
  return !row.isDone && row.status !== 'done';
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
    private readonly travelProvider: GeoapifyTravelProvider,
  ) {}

  async generateDailyPlan(userId: string, request: PlannerRequest = {}): Promise<DailyPlan> {
    const requestId = request.requestId ?? `planner-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.logger.log(`[planner:${requestId}] generate start pid=${process.pid} date=${request.date ?? 'auto'} timezone=${request.timezone ?? 'UTC'}`);
    if (request.regenerate) this.logger.log(`[planner:${requestId}] regeneration ignores persisted unlocked task schedules; explicit locked items remain fixed`);
    // 1. Collect context.
    const context = await this.collectContext(userId, request);

    // 2. Rule Engine prepares constraints.
    const constraints = this.ruleEngine.prepareConstraints(context);

    // Explicit selection is applied after the normal eligibility pass. This
    // keeps permission/date/dependency checks centralized in the API and means
    // stale selections can never bypass today's planner rules.
    const selectionResult = request.mode
      ? await this.applyDailySelection(userId, context, constraints, request)
      : { unscheduledSelectedItems: [], selectedKeys: new Set<string>() };

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

    plan.conflicts = detectScheduleConflicts(
      Object.values(plan.sections).flat(),
      context.commitments,
    );
    const scheduledTasks: ScheduledTaskCandidate[] = Object.values(plan.sections).flat().filter((item) => item.type === 'task').map((item) => ({
      id: item.subtaskId ?? item.taskId ?? item.id,
      title: item.title,
      priority: item.priority,
      dueDate: null,
      durationMinutes: item.durationMinutes,
      scheduledDate: plan.date,
      scheduledStartTime: item.startTime,
      scheduledEndTime: item.endTime,
    }));
    plan.taskConflicts = scheduledTasks.flatMap((task, index) => findTaskTimeConflicts(task, scheduledTasks.slice(index + 1)));
    plan.travelFeasibilityConflicts = await this.detectTravelFeasibility(plan);
    const overflowSelected = plan.unscheduled.filter((item) => selectionResult.selectedKeys.has(
      `${item.taskId ?? ''}:${item.subtaskId ?? ''}`,
    ));
    if (selectionResult.unscheduledSelectedItems.length || overflowSelected.length) {
      plan.unscheduledSelectedItems = [...selectionResult.unscheduledSelectedItems, ...overflowSelected];
    }
    plan.generationRequestId = requestId;
    const generatedItems = Object.values(plan.sections).flat();
    this.logger.log(`[planner:${requestId}] generate response pid=${process.pid} sessions=${generatedItems.filter((item) => item.type === 'task').length} ranges=${generatedItems.filter((item) => item.type === 'task').map((item) => `${item.startTime}-${item.endTime}`).join(',')} scheduled=${plan.capacity.scheduledMinutes} requested=${plan.capacity.requestedMinutes}`);
    return plan;
  }

  async getDailyCandidates(userId: string, request: PlannerRequest = {}) {
    const context = await this.collectContext(userId, request);
    const constraints = this.ruleEngine.prepareConstraints(context);
    const selected = await this.loadDailySelection(userId, context.date);
    const items = context.tasks.map((task) => candidateToSelectionItem(task, context.date, context.timezone ?? 'UTC', constraints));
    return {
      date: context.date,
      timezone: context.timezone,
      availableMinutes: constraints.capacity.workBudgetMinutes,
      selectedItems: selected,
      items,
      blockedItems: items.filter((item) => !item.isManuallySelectable),
    };
  }

  async saveDailySelection(userId: string, input: unknown) {
    const body = input && typeof input === 'object' ? input as Record<string, unknown> : {};
    const date = normalizeDate(typeof body.date === 'string' ? body.date : undefined);
    const timezone = typeof body.timezone === 'string' ? body.timezone : 'UTC';
    const requested = normalizeSelectionItems(body.selectedItems);
    const candidates = await this.getDailyCandidates(userId, { date, timezone });
    const allowed = new Set(candidates.items.filter((item) => item.isManuallySelectable).map((item) => selectionKey(item)));
    const valid = preferChildSelections(requested).filter((item) => allowed.has(selectionKey(item)));
    await this.databaseService.db.delete(plannerDailySelections)
      .where(and(eq(plannerDailySelections.userId, userId), eq(plannerDailySelections.plannerDate, date)));
    if (valid.length) {
      await this.databaseService.db.insert(plannerDailySelections).values(valid.map((item) => ({
        userId,
        plannerDate: date,
        taskId: item.taskId,
        subtaskId: item.subtaskId ?? null,
        selectionSource: 'user',
      })));
    }
    return { date, timezone, selectedItems: valid, rejectedItems: requested.filter((item) => !valid.some((saved) => selectionKey(saved) === selectionKey(item))) };
  }

  private async loadDailySelection(userId: string, date: string): Promise<PlannerSelectionItem[]> {
    const rows = await this.databaseService.db.select({
      taskId: plannerDailySelections.taskId,
      subtaskId: plannerDailySelections.subtaskId,
    }).from(plannerDailySelections).where(and(
      eq(plannerDailySelections.userId, userId),
      eq(plannerDailySelections.plannerDate, date),
    ));
    return rows.map((row) => ({ taskId: row.taskId, subtaskId: row.subtaskId }));
  }

  private async applyDailySelection(
    userId: string,
    context: PlannerContext,
    constraints: ReturnType<PlannerRuleEngine['prepareConstraints']>,
    request: PlannerRequest,
  ) {
    const selected = request.selectedItems
      ? preferChildSelections(request.selectedItems)
      : await this.loadDailySelection(userId, context.date);
    const selectedKeys = new Set(selected.map(selectionKey));
    const eligible = constraints.schedulableTasks;
    const displayItems = context.tasks.map((task) => candidateToSelectionItem(task, context.date, context.timezone ?? 'UTC', constraints));
    const manuallySelectableKeys = new Set(displayItems.filter((item) => item.isManuallySelectable).map((item) => selectionKey(item)));
    const selectedEligible = eligible.filter((task) => selectedKeys.has(taskSelectionKey(task)));
    const selectedManual = context.tasks.filter((task) => selectedKeys.has(taskSelectionKey(task)) && manuallySelectableKeys.has(taskSelectionKey(task)));
    const invalid = selected.filter((item) => !manuallySelectableKeys.has(selectionKey(item)));
    const selectedTaskIds = new Set(selectedManual.map((task) => task.id));
    const invalidItems = invalid.map((item) => ({
      taskId: item.taskId,
      subtaskId: item.subtaskId ?? undefined,
      title: 'Selected work',
      reason: 'This selected item is no longer selectable today (completed, blocked, or inaccessible).',
      status: 'BLOCKED_DEPENDENCY' as const,
      reasonCode: 'dependency_not_completed' as const,
      estimatedMinutes: 0,
      suggestedDate: context.date,
    }));

    const chosen = request.mode === 'selectedPlusAutoFill'
      ? context.tasks.filter((task) => selectedKeys.has(taskSelectionKey(task)) || (!selectedKeys.has(taskSelectionKey(task)) && eligible.some((candidate) => candidate.id === task.id && candidate.scheduleReason === 'backlog')))
      : selectedManual;
    for (const task of chosen) {
      const explicitlySelected = selectedKeys.has(taskSelectionKey(task));
      task.selectionSource = explicitlySelected ? 'user' : 'autoFill';
      if (!task.scheduleReason) task.scheduleReason = 'scheduled_today';
      // An explicitly selected item represents an instruction to plan its
      // complete remaining effort today. The rule engine's daily slice is
      // useful for automatic deadline spreading, but must not turn a selected
      // 135-minute subtask into a single default work block.
      if (explicitlySelected) task.todayRequiredMinutes = task.estimatedMinutes;
      else if (!task.todayRequiredMinutes) task.todayRequiredMinutes = task.estimatedMinutes;
    }
    const chosenIds = new Set(chosen.map((task) => task.id));
    constraints.blockedTasks = constraints.blockedTasks.filter((entry) => !chosenIds.has(entry.task.id));
    constraints.schedulableTasks = chosen;
    return { unscheduledSelectedItems: invalidItems, selectedKeys: new Set(selectedManual.map(taskSelectionKey)) };
  }

  private async detectTravelFeasibility(plan: DailyPlan) {
    const items = Object.values(plan.sections).flat().filter((item) => item.type === 'task').sort((a, b) => a.startTime.localeCompare(b.startTime));
    const conflicts: DailyPlan['travelFeasibilityConflicts'] = [];
    for (let index = 1; index < items.length; index++) {
      const previous = items[index - 1], current = items[index];
      if (!previous.destination || !current.destination) continue;
      const route = await this.travelProvider.estimateRoute({ origin: previous.destination, destination: current.destination, mode: 'driving', departureTime: `${plan.date}T${previous.endTime}`, allowFallback: true });
      if (!route) continue;
      const conflict = travelFeasibilityConflict(previous, current, route);
      if (conflict) conflicts.push(conflict);
    }
    return conflicts;
  }

  /** Step 1 — gather everything the planner needs into a single context object. */
  private async collectContext(userId: string, request: PlannerRequest): Promise<PlannerContext> {
    const timezone = typeof request.timezone === 'string' && request.timezone.trim()
      ? request.timezone.trim()
      : 'UTC';
    const date = request.date
      ? normalizeDate(request.date)
      : dateKeyInTimeZone(new Date(), timezone);
    const requestedHours = normalizeWorkingHours(request.workingHours);
    const breaks = request.breaks?.length ? request.breaks : DEFAULT_BREAKS;

    let [taskRows, reminderRows, dependencyRows, preferences, commitmentWindows] =
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
    taskRows = taskRows.filter((task) => task.status !== 'done');

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
          ? toPlannerTask(unit.task, dependencyRows, estimates.get(unit.task.id), request.regenerate === true && !request.lockedItems?.some((item) => item.taskId === unit.task.id))
        : toPlannerSubtask(
            unit.task,
            unit.subtask,
            dependencyRows,
            estimates.get(unit.subtask.id),
            orderDepsBySubtask.get(unit.subtask.id) ?? [],
            blockingDepsBySubtask.get(unit.subtask.id) ?? [],
            request.regenerate === true && !request.lockedItems?.some((item) => item.taskId === unit.task.id),
          ),
    );

    return {
      userId,
      date,
      currentTime: request.currentTime ?? timeStringInTimeZone(new Date(), timezone),
      workingHours,
      breaks,
      lockedItems: request.lockedItems ?? [],
      tasks: plannerTasks,
      reminders: reminderRows.map((reminder) => toPlannerReminder(reminder, date, timezone)),
      commitments: commitmentWindows.map((window) => ({
        id: window.commitmentId,
        title: window.title,
        start: window.start,
        end: window.end,
        placeName: window.placeName,
      })),
      preferences,
      timezone,
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

  async acceptPlan(userId: string, input: unknown) {
    const body = input && typeof input === 'object' ? input as Record<string, unknown> : {};
    const plan = body.plan;
    if (plan && typeof plan === 'object' && await this.planContainsCompletedWork(userId, plan as DailyPlan)) {
      const date = normalizeDate((plan as DailyPlan).date);
      const regenerated = await this.generateDailyPlan(userId, { date });
      return this.acceptanceService.acceptPlan(userId, { plan: regenerated });
    }
    return this.acceptanceService.acceptPlan(userId, input);
  }

  async getAcceptance(userId: string, date: string) {
    const normalizedDate = normalizeDate(date);
    const accepted = await this.acceptanceService.getAcceptance(userId, normalizedDate);
    if (!accepted || !(await this.planContainsCompletedWork(userId, accepted.plan))) return accepted;
    const regenerated = await this.generateDailyPlan(userId, { date: normalizedDate });
    return this.acceptanceService.acceptPlan(userId, { plan: regenerated });
  }

  resolveConflict(userId: string, input: unknown) {
    return this.acceptanceService.resolveConflict(userId, input);
  }

  private async planContainsCompletedWork(userId: string, plan: DailyPlan): Promise<boolean> {
    const taskItems = Object.values(plan.sections).flat().filter((item) => item.type === 'task');
    if (taskItems.length === 0) return false;
    const taskIds = [...new Set(taskItems.map((item) => item.taskId).filter((id): id is string => Boolean(id)))];
    const subtaskIds = [...new Set(taskItems.map((item) => item.subtaskId).filter((id): id is string => Boolean(id)))];
    const [taskRows, subtaskRows] = await Promise.all([
      taskIds.length
        ? this.databaseService.db.select({ id: tasks.id, status: tasks.status }).from(tasks).where(and(eq(tasks.userId, userId), inArray(tasks.id, taskIds)))
        : Promise.resolve([] as Array<{ id: string; status: string }>),
      subtaskIds.length
        ? this.databaseService.db.select({ id: subtasks.id, status: subtasks.status, isDone: subtasks.isDone }).from(subtasks).where(inArray(subtasks.id, subtaskIds))
        : Promise.resolve([] as Array<{ id: string; status: string; isDone: boolean }>),
    ]);
    const doneTasks = new Set(taskRows.filter((row) => row.status === 'done').map((row) => row.id));
    const doneSubtasks = new Set(subtaskRows.filter((row) => row.isDone || row.status === 'done').map((row) => row.id));
    return taskItems.some((item) => (item.taskId ? doneTasks.has(item.taskId) : false) || (item.subtaskId ? doneSubtasks.has(item.subtaskId) : false));
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
      if (!(subtasksByTask.get(task.id)?.length)) units.push({ kind: 'task', task });
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

function toPlannerTask(task: TaskRow, dependencyRows: DependencyRow[], estimate?: EstimatorResult, ignorePersistedSchedule = false): PlannerTask {
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
    destination: plannerDestination(task.destination),
    scheduledDate: ignorePersistedSchedule ? undefined : task.scheduledDate ?? undefined,
    scheduledStartTime: ignorePersistedSchedule ? null : task.scheduledStartTime,
    scheduledEndTime: ignorePersistedSchedule ? null : task.scheduledEndTime,
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
  ignorePersistedSchedule = false,
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
    destination: plannerDestination(subtask.destination),
    startDate: subtask.startDate?.toISOString(),
    scheduledDate: ignorePersistedSchedule ? undefined : subtask.scheduledDate ?? undefined,
    scheduledStartTime: ignorePersistedSchedule ? null : subtask.scheduledStartTime,
    scheduledEndTime: ignorePersistedSchedule ? null : subtask.scheduledEndTime,
  };
}

function selectionKey(item: PlannerSelectionItem): string {
  return `${item.taskId}:${item.subtaskId ?? ''}`;
}

function taskSelectionKey(task: PlannerTask): string {
  return selectionKey({ taskId: task.taskId, subtaskId: task.subtaskId ?? null });
}

function normalizeSelectionItems(value: unknown): PlannerSelectionItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is PlannerSelectionItem => Boolean(
    item && typeof item === 'object' &&
    typeof (item as PlannerSelectionItem).taskId === 'string',
  )).map((item) => ({
    taskId: item.taskId,
    subtaskId: typeof item.subtaskId === 'string' ? item.subtaskId : null,
  }));
}

function preferChildSelections(items: PlannerSelectionItem[]): PlannerSelectionItem[] {
  const childrenByTask = new Set(items.filter((item) => item.subtaskId).map((item) => item.taskId));
  const unique = new Map<string, PlannerSelectionItem>();
  for (const item of items) {
    if (!item.subtaskId && childrenByTask.has(item.taskId)) continue;
    unique.set(selectionKey(item), { ...item, subtaskId: item.subtaskId ?? null });
  }
  return [...unique.values()];
}

function candidateToSelectionItem(
  task: PlannerTask,
  date?: string,
  timezone = 'UTC',
  constraints?: ReturnType<PlannerRuleEngine['prepareConstraints']>,
) {
  const blocked = constraints?.blockedTasks.find((entry) => entry.task.id === task.id);
  const autoEligible = Boolean(constraints?.schedulableTasks.some((candidate) => candidate.id === task.id));
  const scheduledDay = task.scheduledDate?.slice(0, 10);
  const future = Boolean(
    date && ((scheduledDay && scheduledDay > date) || (task.startDate && isAfterUserDay(task.startDate, date, timezone))),
  );
  const dueDay = task.dueDate ? dateKeyInTimeZone(new Date(task.dueDate), timezone) : undefined;
  const scheduleCategory = scheduledDay === date
    ? 'scheduledToday'
    : dueDay && dueDay < (date ?? '')
      ? 'overdue'
      : future || dueDay
        ? 'upcoming'
        : 'unscheduled';
  const blockedReason = blocked && blocked.status !== 'FUTURE_SCHEDULED' ? blocked.reason : null;
  return {
    taskId: task.taskId,
    subtaskId: task.subtaskId ?? null,
    id: task.id,
    title: task.title,
    priority: task.priority,
    dueDate: task.dueDate,
    estimatedMinutes: task.estimatedMinutes,
    scheduleReason: task.scheduleReason,
    selectionSource: task.selectionSource,
    scheduleCategory,
    scheduledStartAt: scheduledDay && task.scheduledStartTime ? `${scheduledDay}T${task.scheduledStartTime}:00` : undefined,
    isAutoEligibleToday: autoEligible,
    isManuallySelectable: !blockedReason && Number.isFinite(task.estimatedMinutes) && task.estimatedMinutes > 0,
    blockedReason,
  };
}

function plannerDestination(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const v = value as any; const latitude = Number(v.latitude), longitude = Number(v.longitude);
  return typeof v.displayName === 'string' && Number.isFinite(latitude) && Number.isFinite(longitude) ? { displayName: v.displayName, latitude, longitude } : null;
}

/** Returns the later of two HH:mm times, ignoring malformed inputs. */
function laterTime(a: string, b: string): string {
  if (!isTime(b)) return a;
  if (!isTime(a)) return b;
  return toMinutes(b) > toMinutes(a) ? b : a;
}

function toPlannerReminder(reminder: ReminderRow, date: string, timezone: string): PlannerReminder {
  const onDate = reminder.triggerDateTime
    ? dateKeyInTimeZone(reminder.triggerDateTime, timezone) === date
    : false;
  return {
    id: reminder.id,
    title: reminder.title,
    priority: normalizePriority(reminder.priority),
    triggerDateTime: reminder.triggerDateTime?.toISOString(),
    startTime: onDate && reminder.triggerDateTime ? timeStringInTimeZone(reminder.triggerDateTime, timezone) : undefined,
    type: reminder.type,
  };
}
