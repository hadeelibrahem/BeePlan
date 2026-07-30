/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { and, eq, gt, inArray, isNotNull, lte, ne, sql } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service';
import {
  deviceTokens,
  subtasks,
  taskWeatherNotifications,
  tasks,
  weatherTravelPreferences,
} from '../db/schema';
import { NotificationsService } from '../notifications/notifications.service';
import { WeatherTravelService } from './weather-travel.service';

const LOCK_ID = 742_019_331;
@Injectable()
export class WeatherTravelWorker {
  private readonly logger = new Logger(WeatherTravelWorker.name);
  private lastRun = 0;
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
    private readonly service: WeatherTravelService,
    private readonly notifications: NotificationsService,
  ) {}
  @Cron(CronExpression.EVERY_MINUTE)
  async tick() {
    const interval =
      (this.config.get<number>('WEATHER_WORKER_INTERVAL_MINUTES') ?? 10) *
      60_000;
    if (Date.now() - this.lastRun < interval) return;
    this.lastRun = Date.now();
    await this.database.db.transaction(async (transaction) => {
      const locked = await transaction.execute(
        sql`select pg_try_advisory_xact_lock(${LOCK_ID}) as locked`,
      );
      if (!(locked.rows[0] as any)?.locked) return;
      try {
        await this.prepare();
        await this.deliver();
      } catch (error) {
        this.logger.error(
          `Weather-travel worker failed: ${error instanceof Error ? error.message : 'unknown'}`,
        );
      }
    });
  }
  private async prepare() {
    const horizon = new Date(
      Date.now() +
        (this.config.get<number>('WEATHER_LOOKAHEAD_HOURS') ?? 48) * 3_600_000,
    );
    const enabled = await this.database.db
      .select({ userId: weatherTravelPreferences.userId })
      .from(weatherTravelPreferences)
      .where(eq(weatherTravelPreferences.enabled, true));
    for (const { userId } of enabled) {
      const taskRows = await this.database.db
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.userId, userId),
            inArray(tasks.status, ['todo', 'in_progress', 'blocked']),
          ),
        );
      for (const task of taskRows) {
        const children = await this.database.db
          .select({ id: subtasks.id })
          .from(subtasks)
          .where(
            and(
              eq(subtasks.taskId, task.id),
              eq(subtasks.weatherTravelEnabled, true),
              isNotNull(subtasks.scheduledDate),
              isNotNull(subtasks.scheduledStartTime),
              inArray(subtasks.status, ['todo', 'in_progress', 'blocked']),
            ),
          );
        if (
          !children.length &&
          task.weatherTravelEnabled &&
          task.scheduledDate &&
          task.scheduledStartTime
        )
          await this.trySchedule(userId, task.id, undefined, horizon);
        for (const child of children)
          await this.trySchedule(userId, task.id, child.id, horizon);
      }
    }
  }
  private async trySchedule(
    userId: string,
    taskId: string,
    subtaskId: string | undefined,
    horizon: Date,
  ) {
    try {
      const preview = await this.service.previewTask(userId, taskId, subtaskId);
      if (
        preview.eligibility?.eligible &&
        'scheduledTaskTime' in preview &&
        new Date(preview.scheduledTaskTime).getTime() <= horizon.getTime()
      )
        await this.service.schedule(userId, taskId, subtaskId);
    } catch {
      /* retry on next worker pass without leaking provider/location data */
    }
  }
  private async deliver() {
    const due = await this.database.db
      .select()
      .from(taskWeatherNotifications)
      .where(
        and(
          inArray(taskWeatherNotifications.status, [
            'pending',
            'failed_retryable',
          ]),
          lte(taskWeatherNotifications.notificationTime, new Date()),
          gt(taskWeatherNotifications.scheduledTaskTime, new Date()),
        ),
      );
    for (const record of due) {
      const title = 'Weather & travel';
      const body = record.polishedMessage ?? record.deterministicMessage;
      await this.notifications.create({
        userId: record.userId,
        taskId: record.taskId,
        type: 'weather_travel',
        title,
        body,
        data: { weatherTravelNotificationId: record.id },
      });
      const tokens = await this.database.db
        .select()
        .from(deviceTokens)
        .where(eq(deviceTokens.userId, record.userId));
      const delivered = await sendExpo(
        tokens.map((token) => token.token),
        title,
        body,
        record.id,
      );
      await this.database.db
        .update(taskWeatherNotifications)
        .set({
          status:
            delivered || tokens.length === 0 ? 'delivered' : 'failed_retryable',
          deliveredAt: delivered || tokens.length === 0 ? new Date() : null,
          retryCount: record.retryCount + (delivered ? 0 : 1),
          lastErrorCode:
            delivered || tokens.length === 0 ? null : 'push_delivery_failed',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(taskWeatherNotifications.id, record.id),
            ne(taskWeatherNotifications.status, 'delivered'),
          ),
        );
    }
  }
}
async function sendExpo(
  tokens: string[],
  title: string,
  body: string,
  id: string,
) {
  if (!tokens.length) return false;
  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(
        tokens.map((to) => ({
          to,
          title,
          body,
          data: { weatherTravelNotificationId: id },
          sound: 'default',
        })),
      ),
      signal: AbortSignal.timeout(8000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
