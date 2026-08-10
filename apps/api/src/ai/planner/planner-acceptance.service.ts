import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DatabaseService } from '../../db/database.service';
import { plannerAcceptedPlans, scheduleConflictResolutions, subtasks, tasks } from '../../db/schema';
import { RecurringCommitmentsService } from '../../context/recurring-commitments.service';
import { unresolvedScheduleConflicts } from './schedule-conflicts';
import { findTaskTimeConflicts, type ScheduledTaskCandidate } from '../../tasks/task-schedule-conflicts';
import type { DailyPlan } from './planner.types';

export type PlanAcceptance = {
  date: string;
  plan: DailyPlan;
  acceptedAt: string;
};

/**
 * Persists the plan a user has explicitly accepted for a given day, so
 * "Accept Plan" survives navigation/reload instead of living only in
 * component state.
 */
@Injectable()
export class PlannerAcceptanceService {
  private readonly logger = new Logger(PlannerAcceptanceService.name);
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly commitmentsService: RecurringCommitmentsService,
  ) {}

  async getAcceptance(
    userId: string,
    date: string,
  ): Promise<PlanAcceptance | null> {
    const [row] = await this.databaseService.db
      .select()
      .from(plannerAcceptedPlans)
      .where(
        and(
          eq(plannerAcceptedPlans.userId, userId),
          eq(plannerAcceptedPlans.date, date),
        ),
      )
      .limit(1);

    if (!row) return null;

    const plan = row.plan as DailyPlan;
    const [commitments, resolutions] = await Promise.all([
      this.commitmentsService.getBusyWindowsForDate(userId, date),
      this.databaseService.db.select({ conflictKey: scheduleConflictResolutions.conflictKey })
        .from(scheduleConflictResolutions)
        .where(and(eq(scheduleConflictResolutions.userId, userId), eq(scheduleConflictResolutions.date, date))),
    ]);
    const resolved = new Set(resolutions.map((item) => item.conflictKey));
    plan.conflicts = unresolvedScheduleConflicts(
      Object.values(plan.sections).flat(),
      commitments.map((item) => ({ id: item.commitmentId, title: item.title, start: item.start, end: item.end, placeName: item.placeName })),
      resolved,
    );
    const scheduledTasks: ScheduledTaskCandidate[] = Object.values(plan.sections).flat().filter((item) => item.type === 'task').map((item) => ({
      id: item.subtaskId ?? item.taskId ?? item.id,
      title: item.title,
      priority: item.priority,
      dueDate: null,
      durationMinutes: item.durationMinutes,
      scheduledDate: date,
      scheduledStartTime: item.startTime,
      scheduledEndTime: item.endTime,
    }));
    plan.taskConflicts = scheduledTasks.flatMap((task, index) =>
      findTaskTimeConflicts(task, scheduledTasks.slice(index + 1), resolved),
    );
    await this.syncScheduledItems(userId, date, plan, new Date());

    return {
      date: row.date,
      plan,
      acceptedAt: row.acceptedAt.toISOString(),
    };
  }

  async acceptPlan(userId: string, input: unknown): Promise<PlanAcceptance> {
    const body =
      input && typeof input === 'object'
        ? (input as Record<string, unknown>)
        : {};
    const plan = body.plan;

    if (!plan || typeof plan !== 'object') {
      throw new BadRequestException('plan is required.');
    }

    const date = (plan as Record<string, unknown>).date;
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('plan.date must be a YYYY-MM-DD string.');
    }

    const acceptedAt = new Date();
    const values = {
      userId,
      date,
      plan,
      acceptedAt,
      updatedAt: acceptedAt,
    };

    await this.databaseService.db
      .insert(plannerAcceptedPlans)
      .values(values)
      .onConflictDoUpdate({
        target: [plannerAcceptedPlans.userId, plannerAcceptedPlans.date],
        set: values,
      });

    this.logger.log(`[planner-accept] upsert user=${userId} date=${date} generatedAt=${(plan as DailyPlan).generatedAt}`);

    await this.syncScheduledItems(userId, date, plan as DailyPlan, acceptedAt);

    return {
      date,
      plan: plan as DailyPlan,
      acceptedAt: acceptedAt.toISOString(),
    };
  }

  private async syncScheduledItems(userId: string, date: string, plan: DailyPlan, updatedAt: Date) {
    const scheduledItems = Object.values(plan.sections).flat().filter((item) => item.type === 'task');
    this.logger.log(`[planner-accept] sync scheduled rows user=${userId} date=${date} count=${scheduledItems.length}; unlocked generated sessions remain draft-only until this upsert`);
    for (const item of scheduledItems) {
      if (item.subtaskId) {
        await this.databaseService.db.update(subtasks).set({
          scheduledDate: date,
          scheduledStartTime: item.startTime,
          scheduledEndTime: item.endTime,
          updatedAt,
        }).where(eq(subtasks.id, item.subtaskId));
      } else if (item.taskId) {
        await this.databaseService.db.update(tasks).set({
          scheduledDate: date,
          scheduledStartTime: item.startTime,
          scheduledEndTime: item.endTime,
          updatedAt,
        }).where(and(eq(tasks.userId, userId), eq(tasks.id, item.taskId)));
      }
    }
    if (Array.isArray((plan as DailyPlan).travelFeasibilityConflicts) && (plan as DailyPlan).travelFeasibilityConflicts!.length) {
      throw new BadRequestException({ code: 'TRAVEL_FEASIBILITY_CONFLICT', conflicts: (plan as DailyPlan).travelFeasibilityConflicts });
    }
  }

  async resolveConflict(
    userId: string,
    input: unknown,
  ): Promise<{ conflictKey: string; lifecycle: 'resolved'; resolution: string }> {
    const body = input && typeof input === 'object' ? input as Record<string, unknown> : {};
    const conflictKey = typeof body.conflictKey === 'string' ? body.conflictKey : '';
    const date = typeof body.date === 'string' ? body.date : '';
    const resolution = typeof body.resolution === 'string' ? body.resolution : '';
    if (!conflictKey || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequestException('conflictKey and date are required.');
    if (!['keep_commitment', 'keep_task', 'postpone_task', 'cancel_task'].includes(resolution)) {
      throw new BadRequestException('Invalid conflict resolution.');
    }
    const values = {
      userId,
      conflictKey,
      date,
      taskId: typeof body.taskId === 'string' ? body.taskId : null,
      commitmentId: typeof body.commitmentId === 'string' ? body.commitmentId : null,
      resolution,
      resolvedAt: new Date(),
      updatedAt: new Date(),
    };
    await this.databaseService.db.insert(scheduleConflictResolutions).values(values).onConflictDoUpdate({
      target: [scheduleConflictResolutions.userId, scheduleConflictResolutions.conflictKey],
      set: values,
    });
    return { conflictKey, lifecycle: 'resolved', resolution };
  }
}
