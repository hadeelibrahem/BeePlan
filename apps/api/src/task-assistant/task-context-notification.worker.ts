import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { and, eq, inArray, isNull, lte, sql } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service';
import {
  describeDatabaseError,
  withTransientDatabaseRetry,
} from '../db/database-error';
import {
  taskAssistantEvaluations,
  taskAssistantContexts,
  taskAssistantNotifications,
  tasks,
} from '../db/schema';
import { NotificationsService } from '../notifications/notifications.service';
import { TaskAssistantService } from './task-assistant.service';
import {
  RuntimeTelemetryRegistry,
  runtimeTelemetry,
} from '../admin/system-health/runtime-telemetry.registry';

const LOCK_ID = 742_019_332;
@Injectable()
export class TaskContextNotificationWorker {
  private readonly logger = new Logger(TaskContextNotificationWorker.name);
  private running = false;
  constructor(
    private readonly database: DatabaseService,
    private readonly notifications: NotificationsService,
    private readonly assistant: TaskAssistantService,
    private readonly telemetry: RuntimeTelemetryRegistry = runtimeTelemetry,
  ) {}
  @Cron(CronExpression.EVERY_MINUTE)
  async tick() {
    if (this.running) return;
    this.running = true;
    const telemetryStartedAt = Date.now();
    this.telemetry.workerStarted('task-context-worker');
    try {
      this.logger.log(
        JSON.stringify({
          event: 'task_assistant_worker_started',
          at: new Date().toISOString(),
        }),
      );
      await withTransientDatabaseRetry(
        () =>
          this.database.db.transaction(async (tx) => {
            const lock = await tx.execute(
              sql`select pg_try_advisory_xact_lock(${LOCK_ID}) as locked`,
            );
            if (!(lock.rows[0] as { locked?: boolean } | undefined)?.locked)
              return;
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
                await this.assistant.refreshWithLogging(
                  evaluation.userId,
                  evaluation.taskId,
                  'evaluation_expired',
                );
            const now = new Date();
            const pendingRows = await tx
              .select({
                scheduledAt: taskAssistantNotifications.scheduledAt,
              })
              .from(taskAssistantNotifications)
              .where(
                inArray(taskAssistantNotifications.status, [
                  'pending',
                  'failed_retryable',
                ]),
              );
            const due = await tx
              .select({
                notification: taskAssistantNotifications,
                taskStatus: tasks.status,
              })
              .from(taskAssistantNotifications)
              .innerJoin(
                taskAssistantContexts,
                eq(
                  taskAssistantNotifications.contextId,
                  taskAssistantContexts.id,
                ),
              )
              .innerJoin(
                taskAssistantEvaluations,
                and(
                  sql`${taskAssistantEvaluations.contextVersion} = ${taskAssistantContexts.id}::text`,
                  eq(
                    taskAssistantEvaluations.userId,
                    taskAssistantNotifications.userId,
                  ),
                  eq(
                    taskAssistantEvaluations.taskId,
                    taskAssistantNotifications.taskId,
                  ),
                  eq(taskAssistantEvaluations.status, 'current'),
                ),
              )
              .innerJoin(tasks, eq(taskAssistantNotifications.taskId, tasks.id))
              .where(
                and(
                  inArray(taskAssistantNotifications.status, [
                    'pending',
                    'failed_retryable',
                  ]),
                  isNull(taskAssistantNotifications.deliveredAt),
                  lte(taskAssistantNotifications.scheduledAt, now),
                ),
              );
            let finalDueCount = 0;
            let excludedAfterChecks = 0;
            this.logger.log(
              JSON.stringify({
                event: 'task_assistant_due_scan',
                now: now.toISOString(),
                pendingCount: pendingRows.length,
                earliestPending:
                  pendingRows
                    .map((row) => row.scheduledAt.getTime())
                    .sort((a, b) => a - b)
                    .map((value) => new Date(value).toISOString())[0] ?? null,
                timestampDueCount: due.length,
              }),
            );
            this.logger.log(
              JSON.stringify({
                event: 'task_assistant_due_checked',
                count: due.length,
              }),
            );
            for (const row of due) {
              this.logger.log(
                JSON.stringify({
                  event: 'task_assistant_due',
                  notificationId: row.notification.id,
                  taskId: row.notification.taskId,
                  scheduledAt: row.notification.scheduledAt.toISOString(),
                  status: row.notification.status,
                  fingerprint: row.notification.fingerprint,
                }),
              );
              const preferences = await this.assistant.getPreferences(
                row.notification.userId,
              );
              if (!preferences.enabled) {
                excludedAfterChecks += 1;
                await tx
                  .update(taskAssistantNotifications)
                  .set({ status: 'cancelled', updatedAt: new Date() })
                  .where(
                    eq(taskAssistantNotifications.id, row.notification.id),
                  );
                continue;
              }
              if (
                !['todo', 'in_progress', 'blocked'].includes(row.taskStatus)
              ) {
                excludedAfterChecks += 1;
                await tx
                  .update(taskAssistantNotifications)
                  .set({ status: 'cancelled', updatedAt: new Date() })
                  .where(
                    eq(taskAssistantNotifications.id, row.notification.id),
                  );
                continue;
              }
              finalDueCount += 1;
              try {
                const result = await this.notifications.createOnce(
                  {
                    userId: row.notification.userId,
                    taskId: row.notification.taskId,
                    type: 'task_assistant',
                    title: row.notification.title,
                    body: row.notification.body,
                    priority: ['critical', 'high'].includes(
                      row.notification.priority,
                    )
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
                this.logger.log(
                  JSON.stringify({
                    event: 'task_assistant_inbox_notification_result',
                    taskAssistantNotificationId: row.notification.id,
                    inserted: result.inserted,
                    skipped: result.skipped,
                    reason: result.reason ?? null,
                  }),
                );
                if (result.inserted === 0 && result.reason === 'preference') {
                  this.logger.warn(
                    JSON.stringify({
                      event: 'task_assistant_inbox_notification_not_created',
                      taskAssistantNotificationId: row.notification.id,
                      reason: 'notification_preference_suppressed',
                    }),
                  );
                  await tx
                    .update(taskAssistantNotifications)
                    .set({ status: 'cancelled', updatedAt: new Date() })
                    .where(
                      eq(taskAssistantNotifications.id, row.notification.id),
                    );
                  continue;
                }
                await tx
                  .update(taskAssistantNotifications)
                  .set({
                    status: 'delivered',
                    deliveredAt: new Date(),
                    updatedAt: new Date(),
                  })
                  .where(
                    eq(taskAssistantNotifications.id, row.notification.id),
                  );
              } catch (error) {
                const retryCount = row.notification.retryCount + 1;
                await tx
                  .update(taskAssistantNotifications)
                  .set({
                    status:
                      retryCount >= 5 ? 'failed_final' : 'failed_retryable',
                    retryCount,
                    lastErrorCode: 'delivery_failed',
                    updatedAt: new Date(),
                  })
                  .where(
                    eq(taskAssistantNotifications.id, row.notification.id),
                  );
                this.logger.warn(
                  JSON.stringify({
                    event: 'task_assistant_notification_delivery_failed',
                    notificationId: row.notification.id,
                    ...describeDatabaseError(error, 'query'),
                  }),
                );
              }
            }
            this.logger.log(
              JSON.stringify({
                event: 'task_assistant_due_scan_result',
                now: now.toISOString(),
                pendingCount: pendingRows.length,
                earliestPending:
                  pendingRows
                    .map((row) => row.scheduledAt.getTime())
                    .sort((a, b) => a - b)
                    .map((value) => new Date(value).toISOString())[0] ?? null,
                timestampDueCount: due.length,
                finalDueCount,
                excludedAfterChecks,
              }),
            );
          }),
        {
          attempts: 2,
          onRetry: (error, attempt, delayMs) =>
            this.logger.warn(
              JSON.stringify({
                event: 'task_assistant_worker_database_retry',
                attempt,
                delayMs,
                pool: this.database.poolStats(),
                ...describeDatabaseError(error, 'query'),
              }),
            ),
        },
      );
      this.logger.log(
        JSON.stringify({
          event: 'task_assistant_worker_finished',
          at: new Date().toISOString(),
        }),
      );
      this.telemetry.workerSucceeded(
        'task-context-worker',
        Date.now() - telemetryStartedAt,
      );
    } catch (error) {
      this.telemetry.workerFailed(
        'task-context-worker',
        'database_or_delivery_failure',
        Date.now() - telemetryStartedAt,
      );
      this.logger.warn(
        JSON.stringify({
          event: 'task_assistant_worker_failed',
          retryNextRun: true,
          ...describeDatabaseError(error, 'query'),
        }),
      );
    } finally {
      this.running = false;
    }
  }
}
