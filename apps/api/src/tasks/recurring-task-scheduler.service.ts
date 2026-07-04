import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { eq, or, sql } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service';
import { taskActivities, taskRecurrenceRules, tasks } from '../db/schema';

type RecurrenceRow = typeof taskRecurrenceRules.$inferSelect;

/** A chain member as read directly via `due_date::text` — see the note below. */
type ChainTask = {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  priority: string;
  dueDateText: string | null;
  dueTime: string | null;
  categoryId: string | null;
  category: string | null;
  notes: string | null;
  estimatedTimeMinutes: number;
  reminderEnabled: boolean;
  reminderBeforeMinutes: number | null;
  labels: unknown;
  recurrenceRootId: string | null;
};

const WEEKDAY_INDEXES: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

/**
 * Generates the next occurrence of a recurring task once its current
 * occurrence's due date has arrived. This is intentionally NOT wired into
 * the request/response cycle of any controller — it is a background process.
 *
 * How it's triggered:
 * 1. `@Cron(CronExpression.EVERY_HOUR)` runs it automatically whenever the
 *    Nest process is alive (this is enough for Daily/Weekly/Monthly/Yearly
 *    granularity — no sub-hour precision is needed for due-date rollover).
 * 2. `POST /tasks/recurrence/run` (see tasks.controller.ts) lets a signed-in
 *    user manually trigger a catch-up run scoped to their own tasks — useful
 *    for testing locally without waiting for the hourly tick, or for
 *    deployments where a long-lived Node process isn't guaranteed (e.g. a
 *    serverless API) and an external scheduler (cron job, Vercel Cron,
 *    Railway Cron, GitHub Actions on a schedule) should instead hit this
 *    endpoint periodically.
 *
 * IMPORTANT date-handling note: `tasks.due_date` is a timezone-less Postgres
 * `timestamp`. node-postgres's default type parser converts that column to a
 * JS `Date` using the *server process's local timezone*, while values
 * written through Drizzle's normal `Date`-typed column path get serialized
 * using UTC — so a plain `db.select()` round-trip on this column can silently
 * drift by the host's UTC offset (confirmed empirically while building this
 * feature). To keep the scheduler's "is this occurrence due yet" and
 * "what's the next date" logic exact regardless of host timezone, every
 * read/write of `due_date` in this file goes through an explicit
 * `::text`/literal-string cast instead of Drizzle's Date column mode, so the
 * stored "YYYY-MM-DD HH:MM:SS" value is treated as literal wall-clock
 * numbers on both ends.
 */
@Injectable()
export class RecurringTaskSchedulerService {
  private readonly logger = new Logger(RecurringTaskSchedulerService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  @Cron(CronExpression.EVERY_HOUR)
  async handleCron() {
    const created = await this.run();
    if (created > 0) {
      this.logger.log(`Generated ${created} recurring task occurrence(s).`);
    }
  }

  /**
   * Processes active recurrence rules and creates the next task occurrence
   * for any whose current instance is due. If `userId` is provided, only
   * that user's recurring tasks are processed (used by the manual endpoint);
   * otherwise every user's rules are processed (used by the cron tick).
   */
  async run(userId?: string): Promise<number> {
    const rules = await this.db.select().from(taskRecurrenceRules);
    let createdCount = 0;

    for (const rule of rules) {
      if (rule.frequency === 'Never') continue;

      try {
        const created = await this.processRule(rule, userId);
        if (created) createdCount += 1;
      } catch (error) {
        this.logger.error(
          `Failed to process recurrence rule ${rule.id} for task ${rule.taskId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return createdCount;
  }

  private async selectChainTasks(
    where: ReturnType<typeof or>,
  ): Promise<ChainTask[]> {
    const rows = await this.db
      .select({
        id: tasks.id,
        userId: tasks.userId,
        title: tasks.title,
        description: tasks.description,
        priority: tasks.priority,
        dueDateText: sql<string | null>`${tasks.dueDate}::text`,
        dueTime: tasks.dueTime,
        categoryId: tasks.categoryId,
        category: tasks.category,
        notes: tasks.notes,
        estimatedTimeMinutes: tasks.estimatedTimeMinutes,
        reminderEnabled: tasks.reminderEnabled,
        reminderBeforeMinutes: tasks.reminderBeforeMinutes,
        labels: tasks.labels,
        recurrenceRootId: tasks.recurrenceRootId,
      })
      .from(tasks)
      .where(where);

    return rows;
  }

  private async processRule(
    rule: RecurrenceRow,
    restrictToUserId?: string,
  ): Promise<boolean> {
    const [anchorTask] = await this.selectChainTasks(eq(tasks.id, rule.taskId));
    if (!anchorTask) return false;
    if (restrictToUserId && anchorTask.userId !== restrictToUserId)
      return false;

    const rootId = anchorTask.recurrenceRootId ?? anchorTask.id;

    const chain = await this.selectChainTasks(
      or(eq(tasks.id, rootId), eq(tasks.recurrenceRootId, rootId)),
    );

    if (chain.length === 0) return false;

    const withDates = chain
      .map((task) => ({
        task,
        day: task.dueDateText ? this.parseCalendarDay(task.dueDateText) : null,
      }))
      .filter(
        (entry): entry is { task: ChainTask; day: Date } => entry.day !== null,
      );

    if (withDates.length === 0) return false;

    const latest = withDates.reduce((a, b) => (b.day > a.day ? b : a));

    const today = this.truncateToUtcDay(new Date());
    if (latest.day > today) return false; // current occurrence isn't due yet

    const nextDueDay = this.computeNextDueDate(latest.day, rule);
    if (!nextDueDay) return false;

    if (rule.endType === 'date' && rule.endDate) {
      const endDay = this.parseCalendarDay(rule.endDate);
      if (nextDueDay > endDay) return false;
    }

    if (rule.endType === 'occurrences' && rule.occurrences) {
      if (withDates.length >= rule.occurrences) return false;
    }

    const alreadyExists = withDates.some((entry) =>
      this.isSameDay(entry.day, nextDueDay),
    );
    if (alreadyExists) return false;

    const anchor = latest.task;
    const nextDueDateLiteral = this.formatNaiveTimestamp(nextDueDay);

    const [createdTask] = await this.db
      .insert(tasks)
      .values({
        userId: anchor.userId,
        title: anchor.title,
        description: anchor.description,
        priority: anchor.priority,
        status: 'todo',
        progress: 0,
        dueDate: sql`${nextDueDateLiteral}::timestamp`,
        dueTime: anchor.dueTime,
        categoryId: anchor.categoryId,
        category: anchor.category,
        notes: anchor.notes,
        estimatedTimeMinutes: anchor.estimatedTimeMinutes,
        spentTimeMinutes: 0,
        remainingTimeMinutes: anchor.estimatedTimeMinutes,
        reminderEnabled: anchor.reminderEnabled,
        reminderBeforeMinutes: anchor.reminderBeforeMinutes,
        labels: anchor.labels,
        isFavorite: false,
        recurrenceRootId: rootId,
      })
      .returning({ id: tasks.id });

    await this.db.insert(taskActivities).values({
      userId: anchor.userId,
      taskId: createdTask.id,
      action: 'recurrence_generated',
      description: `Automatically created as the next occurrence of "${anchor.title}"`,
      metadata: { recurrenceRootId: rootId, sourceTaskId: anchor.id },
    });

    return true;
  }

  /** Parses a Postgres naive timestamp/date text ("YYYY-MM-DD[ HH:MM:SS]") as literal UTC wall-clock numbers. */
  private parseCalendarDay(text: string): Date {
    const [datePart] = text.split(/[ T]/);
    const [year, month, day] = datePart.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }

  private truncateToUtcDay(date: Date): Date {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
  }

  private isSameDay(a: Date, b: Date) {
    return a.getTime() === b.getTime();
  }

  /** Formats a UTC-based Date as a naive "YYYY-MM-DD HH:MM:SS" literal for storage. */
  private formatNaiveTimestamp(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(
      date.getUTCHours(),
    )}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
  }

  private computeNextDueDate(
    reference: Date,
    rule: RecurrenceRow,
  ): Date | null {
    const weekdays = (rule.weekdays as string[] | null) ?? [];
    const next = new Date(reference);

    switch (rule.frequency) {
      case 'Daily':
        next.setUTCDate(next.getUTCDate() + 1);
        return next;

      case 'Weekly':
        return this.nextWeekday(reference, weekdays, 1);

      case 'Monthly':
        return this.addMonths(reference, 1, rule.monthlyMode);

      case 'Yearly':
        next.setUTCFullYear(next.getUTCFullYear() + 1);
        return next;

      case 'Custom': {
        const interval = Math.max(rule.customInterval ?? 1, 1);
        if (rule.customUnit === 'days') {
          next.setUTCDate(next.getUTCDate() + interval);
          return next;
        }
        if (rule.customUnit === 'months') {
          return this.addMonths(reference, interval, rule.monthlyMode);
        }
        // weeks (default)
        if (weekdays.length) {
          return this.nextWeekday(reference, weekdays, interval);
        }
        next.setUTCDate(next.getUTCDate() + interval * 7);
        return next;
      }

      default:
        return null;
    }
  }

  private nextWeekday(
    reference: Date,
    weekdays: string[],
    intervalWeeks: number,
  ): Date {
    const next = new Date(reference);

    if (!weekdays.length) {
      next.setUTCDate(next.getUTCDate() + 7 * intervalWeeks);
      return next;
    }

    const today = reference.getUTCDay();
    const offsets = weekdays
      .map((day) => WEEKDAY_INDEXES[day])
      .filter((day): day is number => day !== undefined)
      .map((day) => {
        const offset = day - today;
        return offset > 0 ? offset : offset + 7;
      });

    if (!offsets.length) {
      next.setUTCDate(next.getUTCDate() + 7 * intervalWeeks);
      return next;
    }

    const smallestOffset = Math.min(...offsets);
    // If we're repeating every N>1 weeks, once we've cycled through this
    // week's remaining matching weekdays we jump the extra (N-1) weeks.
    next.setUTCDate(
      next.getUTCDate() + smallestOffset + 7 * (intervalWeeks - 1),
    );
    return next;
  }

  private addMonths(
    reference: Date,
    months: number,
    monthlyMode: string | null,
  ): Date {
    const next = new Date(reference);
    const originalDay = next.getUTCDate();
    next.setUTCMonth(next.getUTCMonth() + months);

    if (monthlyMode === 'lastDay') {
      next.setUTCMonth(next.getUTCMonth() + 1, 0); // day 0 of next month = last day of target month
      return next;
    }

    // Handle month-length overflow (e.g. Jan 31 + 1 month should not silently become Mar 3)
    if (next.getUTCDate() !== originalDay) {
      next.setUTCDate(0); // clamp to last day of the shorter target month
    }

    return next;
  }
}
