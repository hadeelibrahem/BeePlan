import { Injectable, Logger } from '@nestjs/common';
import { and, eq, ne } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service';
import { reminders, taskDependencies, tasks } from '../db/schema';
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
    const workingHours = normalizeWorkingHours(request.workingHours);
    const breaks = request.breaks?.length ? request.breaks : DEFAULT_BREAKS;

    const [taskRows, reminderRows, dependencyRows, preferences] = await Promise.all([
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
    ]);

    // Estimate durations + classify task type for tasks with no set duration,
    // instead of falling back on a single fixed default. Known durations are
    // kept verbatim; only their type is classified.
    const estimates = await this.durationEstimator.estimate(
      taskRows.map((task) => ({
        id: task.id,
        title: task.title,
        category: task.category,
        isFocusTask: task.isFocusTask,
        knownMinutes: task.remainingTimeMinutes || task.estimatedTimeMinutes || 0,
      })),
    );

    return {
      userId,
      date,
      currentTime: request.currentTime ?? currentTimeString(),
      workingHours,
      breaks,
      lockedItems: request.lockedItems ?? [],
      tasks: taskRows.map((task) => toPlannerTask(task, dependencyRows, estimates.get(task.id))),
      reminders: reminderRows.map((reminder) => toPlannerReminder(reminder, date)),
      preferences,
    };
  }

  /** Endpoints delegate here so the controller stays thin. */
  getPreferences(userId: string) {
    return this.preferencesService.getPreferences(userId);
  }

  savePreferences(userId: string, input: unknown) {
    return this.preferencesService.savePreferences(userId, input);
  }
}

function normalizeDate(value?: string): string {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Date().toISOString().slice(0, 10);
}

function normalizeWorkingHours(value?: { start?: string; end?: string }): WorkingHours {
  return {
    start: isTime(value?.start) ? value!.start! : DEFAULT_WORKING_HOURS.start,
    end: isTime(value?.end) ? value!.end! : DEFAULT_WORKING_HOURS.end,
  };
}

function toPlannerTask(task: TaskRow, dependencyRows: DependencyRow[], estimate?: EstimatorResult): PlannerTask {
  const known = task.remainingTimeMinutes || task.estimatedTimeMinutes || 0;
  return {
    id: task.id,
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
  };
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
