import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { and, eq, inArray, lte, sql } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service';
import {
  taskAssistantEvaluations,
  taskAssistantNotifications,
  tasks,
} from '../db/schema';
import { NotificationsService } from '../notifications/notifications.service';
import { TaskAssistantService } from './task-assistant.service';

const LOCK_ID = 742_019_332;
@Injectable()
export class TaskContextNotificationWorker {
  private readonly logger = new Logger(TaskContextNotificationWorker.name);
  constructor(
    private readonly database: DatabaseService,
    private readonly notifications: NotificationsService,
    private readonly assistant: TaskAssistantService,
  ) {}
  @Cron(CronExpression.EVERY_MINUTE)
  async tick() {
    await this.database.db.transaction(async (tx) => {
      const lock = await tx.execute(
        sql`select pg_try_advisory_xact_lock(${LOCK_ID}) as locked`,
      );
      if (!(lock.rows[0] as { locked?: boolean } | undefined)?.locked) return;
      const expired = await tx
        .select({
          userId: taskAssistantEvaluations.userId,
          taskId: taskAssistantEvaluations.taskId,
        })
        .from(taskAssistantEvaluations)
        .where(
          and(
            eq(taskAssistantEvaluations.status, 'current'),
            lte(taskAssistantEvaluations.validUntil, new Date()),
          ),
        )
        .limit(100);
      for (const evaluation of expired)
        if (evaluation.taskId)
          await this.assistant
            .refresh(evaluation.userId, evaluation.taskId)
            .catch(() => undefined);
      const due = await tx
        .select({
          notification: taskAssistantNotifications,
          taskStatus: tasks.status,
        })
        .from(taskAssistantNotifications)
        .innerJoin(tasks, eq(taskAssistantNotifications.taskId, tasks.id))
        .where(
          and(
            inArray(taskAssistantNotifications.status, [
              'pending',
              'failed_retryable',
            ]),
            lte(taskAssistantNotifications.scheduledAt, new Date()),
          ),
        );
      for (const row of due) {
        if (!['todo', 'in_progress', 'blocked'].includes(row.taskStatus)) {
          await tx
            .update(taskAssistantNotifications)
            .set({ status: 'cancelled', updatedAt: new Date() })
            .where(eq(taskAssistantNotifications.id, row.notification.id));
          continue;
        }
        try {
          await this.notifications.createOnce(
            {
              userId: row.notification.userId,
              taskId: row.notification.taskId,
              type: 'task_assistant',
              title: row.notification.title,
              body: row.notification.body,
              priority: ['critical', 'high'].includes(row.notification.priority)
                ? 'high'
                : 'normal',
              data: {
                taskAssistantNotificationId: row.notification.id,
                route: `/tasks/${row.notification.taskId}`,
              },
            },
            {
              entityType: 'task_assistant',
              entityId: row.notification.id,
              triggerAt: row.notification.scheduledAt,
              key: row.notification.fingerprint,
            },
          );
          await tx
            .update(taskAssistantNotifications)
            .set({
              status: 'delivered',
              deliveredAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(taskAssistantNotifications.id, row.notification.id));
        } catch (error) {
          const retryCount = row.notification.retryCount + 1;
          await tx
            .update(taskAssistantNotifications)
            .set({
              status: retryCount >= 5 ? 'failed_final' : 'failed_retryable',
              retryCount,
              lastErrorCode: 'delivery_failed',
              updatedAt: new Date(),
            })
            .where(eq(taskAssistantNotifications.id, row.notification.id));
          this.logger.warn(
            `Context notification delivery failed for ${row.notification.id}: ${error instanceof Error ? error.message : 'unknown'}`,
          );
        }
      }
    });
  }
}
