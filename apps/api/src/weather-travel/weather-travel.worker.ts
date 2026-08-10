/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service';
import {
  describeDatabaseError,
  withTransientDatabaseRetry,
} from '../db/database-error';
import {
  subtasks,
  tasks,
  weatherTravelPreferences,
} from '../db/schema';
import { WeatherTravelService } from './weather-travel.service';

const LOCK_ID = 742_019_331;
@Injectable()
export class WeatherTravelWorker {
  private readonly logger = new Logger(WeatherTravelWorker.name);
  private lastRun = 0;
  private running = false;
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
    private readonly service: WeatherTravelService,
  ) {}
  @Cron(CronExpression.EVERY_MINUTE)
  async tick() {
    if (this.running) return;
    const interval =
      (this.config.get<number>('WEATHER_WORKER_INTERVAL_MINUTES') ?? 10) *
      60_000;
    if (Date.now() - this.lastRun < interval) return;
    this.running = true;
    try {
      await withTransientDatabaseRetry(
        () => this.database.db.transaction(async (transaction) => {
          const locked = await transaction.execute(
            sql`select pg_try_advisory_xact_lock(${LOCK_ID}) as locked`,
          );
          if (!(locked.rows[0] as any)?.locked) return;
        // Weather/travel remains a provider precomputation pass. Task Assistant
        // owns contextual notification decisions and delivery.
          await this.prepare();
        }),
        {
          attempts: 2,
          onRetry: (error, attempt, delayMs) => this.logger.warn(JSON.stringify({
            event: 'weather_travel_worker_database_retry',
            attempt,
            delayMs,
            pool: this.database.poolStats(),
            ...describeDatabaseError(error, 'query'),
          })),
        },
      );
      this.lastRun = Date.now();
      this.logger.debug(JSON.stringify({
        event: 'weather_travel_worker_finished',
        pool: this.database.poolStats(),
      }));
    } catch (error) {
      this.logger.warn(JSON.stringify({
        event: 'weather_travel_worker_failed',
        retryNextTick: true,
        pool: this.database.poolStats(),
        ...describeDatabaseError(error, 'query'),
      }));
    } finally {
      this.running = false;
    }
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
        await this.service.previewTask(userId, taskId, subtaskId);
    } catch {
      /* retry on next worker pass without leaking provider/location data */
    }
  }
}
