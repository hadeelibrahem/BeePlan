import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { and, eq, gte, isNotNull, lte, ne } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service';
import {
  describeDatabaseError,
  withTransientDatabaseRetry,
} from '../db/database-error';
import {
  focusSessions,
  googleCalendarEvents,
  subtasks,
  tasks,
} from '../db/schema';
import { NotificationsService } from './notifications.service';

const MINUTE = 60_000;

/** Durable, retry-safe producers for time-based notifications. */
@Injectable()
export class NotificationSchedulerService {
  private readonly logger = new Logger(NotificationSchedulerService.name);
  private running = false;
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly notifications: NotificationsService,
  ) {}
  private get db() {
    return this.databaseService.db;
  }

  @Cron('* * * * *')
  async tick() {
    if (this.running) return;
    this.running = true;
    const now = new Date();
    try {
      const scans = [
        ['tasks', () => this.emitTaskReminders(now)],
        ['calendar', () => this.emitCalendarReminders(now)],
        ['focus', () => this.emitFocusReminders(now)],
      ] as const;
      const results = await Promise.allSettled(scans.map(([, scan]) =>
        withTransientDatabaseRetry(scan, { attempts: 2 })));
      results.forEach((result, index) => {
        if (result.status === 'rejected') this.logger.warn(JSON.stringify({
          event: 'notification_scheduler_scan_failed',
          scan: scans[index][0],
          retryNextTick: true,
          pool: this.databaseService.poolStats(),
          ...describeDatabaseError(result.reason, 'query'),
        }));
      });
      this.logger.debug(JSON.stringify({
        event: 'notification_scheduler_finished',
        successfulScans: results.filter((result) => result.status === 'fulfilled').length,
        failedScans: results.filter((result) => result.status === 'rejected').length,
        pool: this.databaseService.poolStats(),
      }));
    } finally {
      this.running = false;
    }
  }

  private async emitTaskReminders(now: Date) {
    const horizon = new Date(now.getTime() + 2 * 60 * MINUTE);
    const rows = await this.db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.reminderEnabled, true),
          isNotNull(tasks.dueDate),
          lte(tasks.dueDate, horizon),
          ne(tasks.status, 'done'),
        ),
      )
      .limit(500);
    for (const task of rows) {
      if (!task.dueDate) continue;
      const dueAt = task.dueDate;
      const before = Math.max(0, task.reminderBeforeMinutes ?? 0);
      const reminderAt = new Date(dueAt.getTime() - before * MINUTE);
      if (
        reminderAt <= now &&
        reminderAt >= new Date(now.getTime() - 2 * 60 * MINUTE)
      ) {
        await this.notifications.createOnce(
          {
            userId: task.userId,
            type: 'reminder',
            taskId: task.id,
            title: 'Task reminder',
            body: `${task.title} is due soon.`,
            data: {
              entityType: 'task',
              entityId: task.id,
              route: `/tasks/${task.id}`,
              event: 'due_reminder',
            },
          },
          {
            entityType: 'task_due',
            entityId: task.id,
            triggerAt: reminderAt,
            key: `task_due:${task.userId}:${task.id}:${dueAt.toISOString()}:${before}`,
          },
        );
      }
      if (dueAt <= now) {
        await this.notifications.createOnce(
          {
            userId: task.userId,
            type: 'task_overdue',
            taskId: task.id,
            title: 'Task overdue',
            body: `${task.title} is overdue.`,
            data: {
              entityType: 'task',
              entityId: task.id,
              route: `/tasks/${task.id}`,
              event: 'overdue',
            },
          },
          {
            entityType: 'task_overdue',
            entityId: task.id,
            triggerAt: dueAt,
            key: `task_overdue:${task.userId}:${task.id}:${dueAt.toISOString()}`,
          },
        );
      }
    }
    const subRows = await this.db
      .select()
      .from(subtasks)
      .where(
        and(
          eq(subtasks.reminderEnabled, true),
          isNotNull(subtasks.dueDate),
          lte(subtasks.dueDate, horizon),
          ne(subtasks.status, 'done'),
        ),
      )
      .limit(500);
    for (const subtask of subRows) {
      if (!subtask.dueDate || !subtask.reminderTime || !subtask.assigneeUserId)
        continue;
      if (
        subtask.reminderTime <= now &&
        subtask.reminderTime >= new Date(now.getTime() - 2 * 60 * MINUTE)
      ) {
        await this.notifications.createOnce(
          {
            userId: subtask.assigneeUserId,
            type: 'reminder',
            taskId: subtask.taskId,
            title: 'Subtask reminder',
            body: `${subtask.title} is due soon.`,
            data: {
              entityType: 'subtask',
              entityId: subtask.id,
              taskId: subtask.taskId,
              route: `/tasks/${subtask.taskId}`,
              event: 'due_reminder',
            },
          },
          {
            entityType: 'subtask_due',
            entityId: subtask.id,
            triggerAt: subtask.reminderTime,
            key: `subtask_due:${subtask.assigneeUserId}:${subtask.id}:${subtask.dueDate.toISOString()}`,
          },
        );
      }
    }
  }

  private async emitCalendarReminders(now: Date) {
    const until = new Date(now.getTime() + 30 * MINUTE);
    const rows = await this.db
      .select()
      .from(googleCalendarEvents)
      .where(
        and(
          eq(googleCalendarEvents.status, 'synced'),
          eq(googleCalendarEvents.ownership, 'google_imported'),
          isNotNull(googleCalendarEvents.startAt),
          gte(googleCalendarEvents.startAt, now),
          lte(googleCalendarEvents.startAt, until),
        ),
      )
      .limit(500);
    for (const event of rows) {
      if (!event.startAt) continue;
      await this.notifications.createOnce(
        {
          userId: event.userId,
          type: 'calendar_event_created',
          title: 'Upcoming calendar event',
          body: `${event.title} starts soon.`,
          data: {
            entityType: 'calendar_event',
            entityId: event.id,
            route: `/calendar?event=${event.id}`,
            event: 'upcoming',
          },
        },
        {
          entityType: 'calendar_upcoming',
          entityId: event.id,
          triggerAt: event.startAt,
          key: `calendar_upcoming:${event.userId}:${event.id}:${event.startAt.toISOString()}`,
        },
      );
    }
  }

  private async emitFocusReminders(now: Date) {
    const rows = await this.db
      .select()
      .from(focusSessions)
      .where(
        and(
          eq(focusSessions.status, 'active'),
          isNotNull(focusSessions.endsAt),
          lte(focusSessions.endsAt, new Date(now.getTime() + 10 * MINUTE)),
        ),
      )
      .limit(500);
    for (const session of rows) {
      if (!session.endsAt) continue;
      const reminderAt = new Date(session.endsAt.getTime() - 10 * MINUTE);
      if (
        reminderAt <= now &&
        reminderAt >= new Date(now.getTime() - 2 * MINUTE)
      ) {
        await this.notifications.createOnce(
          {
            userId: session.userId,
            type: 'focus_reminder',
            taskId: session.taskId,
            title: 'Focus session ending soon',
            body: 'Your focus session ends in about 10 minutes.',
            data: {
              entityType: 'focus_session',
              entityId: session.id,
              route: '/focus',
              event: 'ending_soon',
            },
          },
          {
            entityType: 'focus_reminder',
            entityId: session.id,
            triggerAt: reminderAt,
            key: `focus_reminder:${session.userId}:${session.id}:${session.endsAt.toISOString()}`,
          },
        );
      }
    }
    const missed = await this.db
      .select()
      .from(focusSessions)
      .where(
        and(
          eq(focusSessions.status, 'active'),
          isNotNull(focusSessions.endsAt),
          lte(focusSessions.endsAt, now),
        ),
      )
      .limit(500);
    for (const session of missed) {
      if (!session.endsAt) continue;
      await this.notifications.createOnce(
        {
          userId: session.userId,
          type: 'focus_session_missed',
          taskId: session.taskId,
          title: 'Focus session missed',
          body: 'Your focus session ended without being completed.',
          data: {
            entityType: 'focus_session',
            entityId: session.id,
            route: '/focus',
            event: 'missed',
          },
        },
        {
          entityType: 'focus_missed',
          entityId: session.id,
          triggerAt: session.endsAt,
          key: `focus_missed:${session.userId}:${session.id}:${session.endsAt.toISOString()}`,
        },
      );
    }
  }
}
