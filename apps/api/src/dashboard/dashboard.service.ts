import { Injectable } from '@nestjs/common';
import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service';
import { focusSessions, plannerAcceptedPlans, reminders, subtasks, tasks, users } from '../db/schema';
import { FocusService } from '../focus/focus.service';
import type { FocusRecommendation } from '../focus/focus.logic';
import { getUtcDayBoundaries } from './dashboard-date.util';
import { dailyStatusFor, greetingForHour, progressForToday } from './dashboard-today.logic';
import { getDashboardDayBoundaries } from './dashboard-timezone';

export type DashboardSummary = {
  todayTasks: number;
  completedTasks: number;
  highPriorityTasks: number;
  reminders: number;
  totalTasks: number;
  overallProgress: number;
};

@Injectable()
export class DashboardService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly focusService: FocusService,
  ) {}

  private get db() {
    return this.databaseService.db;
  }

  async getSummary(userId: string): Promise<DashboardSummary> {
    const { startOfToday, startOfTomorrow } = getUtcDayBoundaries();
    const [taskRows, reminderRows] = await Promise.all([
      this.db
        .select({
          total: sql<string>`count(*)`,
          completed: sql<string>`count(*) filter (where ${tasks.status} = 'done')`,
          highPriority: sql<string>`count(*) filter (where ${tasks.priority} = 'high')`,
          today: sql<string>`count(*) filter (where ${tasks.dueDate} >= ${startOfToday} and ${tasks.dueDate} < ${startOfTomorrow})`,
          taskReminders: sql<string>`count(*) filter (where ${tasks.reminderEnabled} = true)`,
        })
        .from(tasks)
        .where(eq(tasks.userId, userId)),
      this.db
        .select({
          active: sql<string>`count(*) filter (where ${reminders.status} = 'active')`,
        })
        .from(reminders)
        .where(eq(reminders.userId, userId)),
    ]);

    // Compare in UTC rather than the server process's local time zone. The
    // `due_date` column is a timezone-less `timestamp`, and Postgres/driver
    // round-tripping of JS Date values through it is only consistent in UTC —
    // using local `setHours()` here caused tasks due "yesterday" evening to
    // be miscounted as "today" whenever the local UTC offset was positive.
    const taskCounts = taskRows[0];
    const totalTasks = Number(taskCounts?.total ?? 0);
    const completedTasks = Number(taskCounts?.completed ?? 0);
    const highPriorityTasks = Number(taskCounts?.highPriority ?? 0);
    const todayTasks = Number(taskCounts?.today ?? 0);

    // Standalone active reminders and task-level reminder toggles are separate
    // concepts, so both contribute to the dashboard reminder count.
    const taskReminders = Number(taskCounts?.taskReminders ?? 0);
    const activeReminders = Number(reminderRows[0]?.active ?? 0);

    const overallProgress =
      totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);

    return {
      todayTasks,
      completedTasks,
      highPriorityTasks,
      reminders: activeReminders + taskReminders,
      totalTasks,
      overallProgress,
    };
  }

  /**
   * Action-oriented daily aggregation. Every value is derived from persisted
   * BeePlan data; absent integrations deliberately return no section rather
   * than a guessed calendar, location, sleep, or AI signal.
   */
  async getToday(userId: string) {
    const now = new Date();
    const [user] = await this.db.select({ fullName: users.fullName, timezone: users.timezone }).from(users).where(eq(users.id, userId)).limit(1);
    const { timezone, localDate: todayKey, tomorrowDate: tomorrowKey, startOfToday, startOfTomorrow, startOfDayAfterTomorrow, localHour } = getDashboardDayBoundaries(user?.timezone, now);

    const [taskRows, focusRows, recommendation, acceptedToday, acceptedTomorrow] = await Promise.all([
      this.db.select().from(tasks).where(eq(tasks.userId, userId)),
      this.db.select().from(focusSessions).where(and(eq(focusSessions.userId, userId), gte(focusSessions.startedAt, startOfToday), lt(focusSessions.startedAt, startOfTomorrow))),
      this.focusService.recommendation(userId),
      this.getAcceptedPlan(userId, todayKey),
      this.getAcceptedPlan(userId, tomorrowKey),
    ]);
    const taskIds = taskRows.map((task) => task.id);
    const subtaskRows = taskIds.length
      ? await this.db.select().from(subtasks).where(inArray(subtasks.taskId, taskIds))
      : [];
    const focusToday = focusRows.map((session) => this.toFocusEntity(session, taskRows, subtaskRows));
    const todayCompletedFocusMinutes = focusRows.filter((session) => session.status === 'completed').reduce((total, session) => total + Math.max(0, session.actualMinutes ?? 0), 0);
    const todayTasks = taskRows.filter((task) => isInRange(task.dueDate, startOfToday, startOfTomorrow));
    const todaySubtasks = subtaskRows.filter((subtask) => isInRange(subtask.dueDate, startOfToday, startOfTomorrow));
    const progress = progressForToday([
      ...todayTasks.map((task) => ({ dueAt: task.dueDate, status: task.status, estimatedMinutes: task.estimatedTimeMinutes, spentMinutes: task.spentTimeMinutes, completed: task.status === 'done' })),
      ...todaySubtasks.map((subtask) => ({ dueAt: subtask.dueDate, status: subtask.status, estimatedMinutes: subtask.estimatedDurationMinutes ?? 0, spentMinutes: subtask.actualDurationMinutes ?? 0, completed: subtask.isDone || subtask.status === 'done' })),
    ], todayCompletedFocusMinutes);
    const overdueCount = [...taskRows, ...subtaskRows].filter((item) => item.status !== 'done' && item.status !== 'missed' && item.dueDate && item.dueDate < startOfToday).length;
    const status = dailyStatusFor({
      totalWorkUnits: progress.totalWorkUnits,
      completedWorkUnits: progress.completedWorkUnits,
      overdueCount,
      remainingEstimatedMinutes: progress.remainingEstimatedMinutes,
      capacityMinutes: acceptedToday?.capacity?.availableMinutes ?? null,
    });
    let activeFocus = focusToday.find((session) => session.status === 'active' || session.status === 'paused') ?? null;
    // An unfinished session can cross midnight, while FocusService.today()
    // intentionally returns only sessions started today. Keep the dashboard's
    // primary action unambiguous in that edge case too.
    if (!activeFocus) {
      const [activeRow] = await this.db.select().from(focusSessions)
        .where(and(eq(focusSessions.userId, userId), sql`${focusSessions.status} in ('active', 'paused')`))
        .limit(1);
      if (activeRow) {
        activeFocus = this.toFocusEntity(activeRow, taskRows, subtaskRows);
      }
    }
    const primary = activeFocus ? null : this.enrichRecommendation(recommendation, taskRows, subtaskRows);
    const whyNow = primary ? this.whyNow(primary, taskRows, subtaskRows, now) : [];
    const dueTomorrowTasks = taskRows.filter((task) => isInRange(task.dueDate, startOfTomorrow, startOfDayAfterTomorrow));
    const dueTomorrowSubtasks = subtaskRows.filter((subtask) => isInRange(subtask.dueDate, startOfTomorrow, startOfDayAfterTomorrow));
    const tomorrowUnits = [...dueTomorrowTasks, ...dueTomorrowSubtasks];
    const tomorrowEstimatedMinutes = dueTomorrowTasks.reduce((sum, item) => sum + Math.max(0, item.estimatedTimeMinutes), 0) + dueTomorrowSubtasks.reduce((sum, item) => sum + Math.max(0, item.estimatedDurationMinutes ?? 0), 0);

    return {
      generatedAt: now.toISOString(),
      timezone,
      greeting: `${greetingForHour(localHour)}, ${user?.fullName ?? 'there'}`,
      dailyStatus: {
        ...status,
        summaryLines: [
          progress.remainingEstimatedMinutes ? `${progress.remainingEstimatedMinutes} minutes of estimated work remain.` : 'No estimated work remains.',
          overdueCount ? `${overdueCount} overdue ${overdueCount === 1 ? 'item needs' : 'items need'} attention.` : `${tomorrowUnits.length} item${tomorrowUnits.length === 1 ? '' : 's'} due tomorrow.`,
        ],
      },
      activeFocus,
      recommendation: primary,
      whyNow,
      timeline: this.timeline(activeFocus, acceptedToday, todayKey),
      locationContext: null,
      suggestions: [],
      progress,
      tomorrowPreview: {
        date: tomorrowKey,
        calendarEvents: [],
        dueWorkUnits: tomorrowUnits.length,
        estimatedWorkMinutes: tomorrowEstimatedMinutes,
        highPriorityItems: tomorrowUnits.filter((item) => item.priority === 'high' || item.priority === 'urgent').length,
        capacityMinutes: acceptedTomorrow?.capacity?.availableMinutes ?? null,
        overloadStatus: acceptedTomorrow?.capacity
          ? tomorrowEstimatedMinutes > acceptedTomorrow.capacity.availableMinutes ? 'overloaded' : 'within_capacity'
          : 'unavailable',
      },
    };
  }

  private async getAcceptedPlan(userId: string, date: string): Promise<any | null> {
    const [row] = await this.db.select({ plan: plannerAcceptedPlans.plan }).from(plannerAcceptedPlans)
      .where(and(eq(plannerAcceptedPlans.userId, userId), eq(plannerAcceptedPlans.date, date))).limit(1);
    return row?.plan ?? null;
  }

  private toFocusEntity(session: typeof focusSessions.$inferSelect, taskRows: typeof tasks.$inferSelect[], subtaskRows: typeof subtasks.$inferSelect[]) {
    const task = taskRows.find((item) => item.id === session.taskId);
    const subtask = subtaskRows.find((item) => item.id === session.subtaskId);
    return { id: session.id, taskId: session.taskId, taskTitle: task?.title ?? null, subtaskId: session.subtaskId, subtaskTitle: subtask?.title ?? null, startedAt: session.startedAt.toISOString(), endedAt: session.endedAt?.toISOString() ?? null, plannedMinutes: session.plannedMinutes, actualMinutes: session.actualMinutes, status: session.status, sessionType: session.sessionType, notes: session.notes, createdAt: session.createdAt.toISOString() };
  }

  /**
   * The Focus recommendation intentionally carries only the fields the Focus
   * screen needs. The home-screen widget additionally needs the recommended
   * unit's `priority` and `dueAt` to render its priority chip and due-date
   * label — neither is derivable from `whyNow` (which only encodes
   * overdue/due-today/high-priority). Both live on the underlying task/subtask
   * row, so we surface them here as additive, backward-compatible fields rather
   * than adding a widget-only endpoint. `null` when the row is missing or the
   * field is unset; existing clients ignore the extra keys.
   */
  private enrichRecommendation(
    recommendation: FocusRecommendation | null,
    taskRows: typeof tasks.$inferSelect[],
    subtaskRows: typeof subtasks.$inferSelect[],
  ): (FocusRecommendation & { priority: string | null; dueAt: string | null }) | null {
    if (!recommendation) return null;
    const task = taskRows.find((item) => item.id === recommendation.taskId);
    const subtask = recommendation.subtaskId
      ? subtaskRows.find((item) => item.id === recommendation.subtaskId)
      : null;
    const unit = subtask ?? task;
    return {
      ...recommendation,
      priority: unit?.priority ?? null,
      dueAt: unit?.dueDate ? unit.dueDate.toISOString() : null,
    };
  }

  private whyNow(recommendation: FocusRecommendation, taskRows: typeof tasks.$inferSelect[], subtaskRows: typeof subtasks.$inferSelect[], now: Date) {
    const task = taskRows.find((item) => item.id === recommendation.taskId);
    const subtask = recommendation.subtaskId ? subtaskRows.find((item) => item.id === recommendation.subtaskId) : null;
    const unit = subtask ?? task;
    if (!unit) return [];
    const due = unit.dueDate;
    const reasons: { code: string; label: string; value?: string }[] = [];
    if (due && due < now) reasons.push({ code: 'overdue', label: 'Overdue' });
    else if (due && due.toISOString().slice(0, 10) === now.toISOString().slice(0, 10)) reasons.push({ code: 'due_today', label: 'Due today' });
    if (unit.priority === 'high' || unit.priority === 'urgent') reasons.push({ code: 'high_priority', label: 'High priority' });
    if (unit.status === 'in_progress' || (!subtask && task && task.progress > 0)) reasons.push({ code: 'in_progress', label: 'Already in progress' });
    if (recommendation.estimatedMinutes && recommendation.estimatedMinutes > 0) reasons.push({ code: 'estimated', label: 'Has an estimated focus length', value: `${recommendation.estimatedMinutes} min` });
    return reasons;
  }

  private timeline(activeFocus: any, plan: any | null, date: string) {
    const blocks: any[] = [];
    if (activeFocus) blocks.push({ id: activeFocus.id, type: 'focus', startTime: activeFocus.startedAt, endTime: activeFocus.endedAt ?? null, title: activeFocus.subtaskTitle ?? activeFocus.taskTitle ?? 'Focus session', taskId: activeFocus.taskId, subtaskId: activeFocus.subtaskId, status: activeFocus.status, source: 'focus_session' });
    const sections = plan?.sections && typeof plan.sections === 'object' ? Object.values(plan.sections).flat() as any[] : [];
    for (const item of sections) {
      if (!item || typeof item !== 'object' || typeof item.startTime !== 'string' || typeof item.endTime !== 'string') continue;
      blocks.push({ id: item.id, type: item.isFocusTask ? 'focus' : item.type === 'calendar' ? 'event' : item.type, startTime: `${date}T${item.startTime}:00.000Z`, endTime: `${date}T${item.endTime}:00.000Z`, title: item.title, taskId: item.taskId ?? null, subtaskId: null, status: 'planned', source: 'accepted_daily_plan' });
    }
    return blocks.sort((a, b) => a.startTime.localeCompare(b.startTime));
  }
}

function isInRange(value: Date | null, start: Date, end: Date) {
  return Boolean(value && value >= start && value < end);
}
