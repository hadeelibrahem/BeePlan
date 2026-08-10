import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { and, asc, eq, lte } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service';
import { describeDatabaseError } from '../db/database-error';
import {
  plannerPreferences,
  pushNotificationJobs,
  userNotificationPreferences,
  userPushDevices,
  users,
} from '../db/schema';
import type { CreateNotificationInput } from './notifications.service';
import { isPushEligible, pushPriorityFor } from './push-eligibility';

type DeviceRegistration = {
  expoPushToken: string;
  platform: 'android' | 'ios';
  installationId: string;
  deviceName?: string;
  appVersion?: string;
};

type PushDatabaseExecutor = Pick<DatabaseService['db'], 'select' | 'insert'>;

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
export const BEEPLAN_DEFAULT_ANDROID_CHANNEL_ID = 'beeplan-default-v2';

export function channelFor(type: string) {
  // Android notification channel behavior is immutable after creation. Keep
  // Task Assistant on the versioned, sound-enabled channel rather than the
  // legacy generic AI channel used by existing installations.
  if (type === 'task_assistant') return BEEPLAN_DEFAULT_ANDROID_CHANNEL_ID;
  if (
    type.includes('calendar') ||
    type.includes('deadline') ||
    type.includes('schedule')
  )
    return 'calendar';
  if (type.includes('focus')) return 'focus';
  if (
    type.includes('ai') ||
    type.includes('risk') ||
    type.includes('workload') ||
    type.includes('planner')
  )
    return 'ai';
  if (
    type.includes('invite') ||
    type.includes('mention') ||
    type.includes('comment') ||
    type.includes('member')
  )
    return 'collaboration';
  if (type === 'reminder') return 'reminders';
  return 'tasks';
}

type ExpoPushJob = Pick<
  typeof pushNotificationJobs.$inferSelect,
  'expoPushToken' | 'title' | 'body' | 'priority' | 'payload'
>;

export function createExpoPushMessage(job: ExpoPushJob) {
  return {
    to: job.expoPushToken,
    title: job.title,
    body: job.body,
    sound: 'default' as const,
    priority: job.priority,
    channelId:
      (job.payload as { channelId?: string }).channelId ??
      BEEPLAN_DEFAULT_ANDROID_CHANNEL_ID,
    data: job.payload,
  };
}

@Injectable()
export class PushNotificationsService {
  private readonly logger = new Logger(PushNotificationsService.name);
  private processing = false;
  constructor(private readonly databaseService: DatabaseService) {}
  private get db() {
    return this.databaseService.db;
  }

  async register(userId: string, input: DeviceRegistration) {
    const values = {
      userId,
      expoPushToken: input.expoPushToken,
      platform: input.platform,
      installationId: input.installationId,
      deviceName: input.deviceName ?? null,
      appVersion: input.appVersion ?? null,
      enabled: true,
      lastSeenAt: new Date(),
      updatedAt: new Date(),
    };
    const [existing] = await this.db
      .select({ id: userPushDevices.id })
      .from(userPushDevices)
      .where(
        and(
          eq(userPushDevices.userId, userId),
          eq(userPushDevices.installationId, input.installationId),
        ),
      )
      .limit(1);
    const [row] = existing
      ? await this.db
          .update(userPushDevices)
          .set(values)
          .where(eq(userPushDevices.id, existing.id))
          .returning()
      : await this.db
          .insert(userPushDevices)
          .values(values)
          .onConflictDoUpdate({
            target: userPushDevices.expoPushToken,
            set: values,
          })
          .returning();
    return {
      id: row.id,
      platform: row.platform,
      enabled: row.enabled,
      lastSeenAt: row.lastSeenAt,
    };
  }

  async update(userId: string, installationId: string, enabled: boolean) {
    const [row] = await this.db
      .update(userPushDevices)
      .set({ enabled, lastSeenAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(userPushDevices.userId, userId),
          eq(userPushDevices.installationId, installationId),
        ),
      )
      .returning({ id: userPushDevices.id, enabled: userPushDevices.enabled });
    return row ?? { id: null, enabled: false };
  }

  async remove(userId: string, installationId: string) {
    await this.db
      .update(userPushDevices)
      .set({ enabled: false, updatedAt: new Date() })
      .where(
        and(
          eq(userPushDevices.userId, userId),
          eq(userPushDevices.installationId, installationId),
        ),
      );
    return { success: true };
  }

  async list(userId: string) {
    return this.db
      .select({
        id: userPushDevices.id,
        platform: userPushDevices.platform,
        installationId: userPushDevices.installationId,
        deviceName: userPushDevices.deviceName,
        appVersion: userPushDevices.appVersion,
        enabled: userPushDevices.enabled,
        lastSeenAt: userPushDevices.lastSeenAt,
      })
      .from(userPushDevices)
      .where(eq(userPushDevices.userId, userId))
      .orderBy(asc(userPushDevices.lastSeenAt));
  }

  async enqueueForNotification(
    notificationId: string,
    input: CreateNotificationInput,
    executor: PushDatabaseExecutor = this.db,
  ) {
    const requestedPriority =
      typeof input.data?.priority === 'string'
        ? (input.data.priority as 'high' | 'normal' | 'low')
        : undefined;
    const priority = requestedPriority ?? pushPriorityFor(input.type);
    if (!priority || !isPushEligible(input.type, priority)) {
      this.logger.log(JSON.stringify({ event: 'push_job_skipped', notificationId, reason: 'not_push_eligible', type: input.type }));
      return;
    }
    const [preferences] = await executor
      .select({ enabled: userNotificationPreferences.pushNotifications })
      .from(userNotificationPreferences)
      .where(eq(userNotificationPreferences.userId, input.userId))
      .limit(1);
    if (preferences && !preferences.enabled) {
      this.logger.log(JSON.stringify({ event: 'push_job_skipped', notificationId, reason: 'push_preference_disabled' }));
      return;
    }
    const devices = await executor
      .select()
      .from(userPushDevices)
      .where(
        and(
          eq(userPushDevices.userId, input.userId),
          eq(userPushDevices.enabled, true),
        ),
      );
    if (!devices.length) {
      this.logger.warn(JSON.stringify({ event: 'push_job_skipped', notificationId, reason: 'no_enabled_devices' }));
      return;
    }
    this.logger.log(JSON.stringify({ event: 'push_devices_selected', notificationId, count: devices.length, platforms: [...new Set(devices.map((device) => device.platform))], priority }));
    const quietUntil =
      priority === 'high'
        ? null
        : await this.quietUntil(input.userId, new Date(), executor);
    const inserted = await executor
      .insert(pushNotificationJobs)
      .values(
        devices.map((device) => ({
          notificationId,
          userId: input.userId,
          deviceId: device.id,
          expoPushToken: device.expoPushToken,
          title: input.title,
          body: input.body,
          priority,
          payload: {
            ...(input.data ?? {}),
            notificationId,
            notificationType: input.type,
            channelId: channelFor(input.type),
          },
          nextRetryAt: quietUntil ?? new Date(),
        })),
      )
      .onConflictDoNothing({
        target: [
          pushNotificationJobs.notificationId,
          pushNotificationJobs.deviceId,
        ],
      })
      .returning({ id: pushNotificationJobs.id });
    this.logger.log(JSON.stringify({ event: 'push_jobs_created', notificationId, count: inserted.length, selectedCount: devices.length }));
  }

  @Cron('* * * * *')
  async processQueue() {
    if (this.processing) {
      this.logger.warn(JSON.stringify({ event: 'push_scheduler_overlap_skipped', retryNextTick: true }));
      return;
    }
    this.processing = true;
    try {
      await this.processQueueUnsafe();
      this.logger.debug(JSON.stringify({
        event: 'push_scheduler_finished',
        pool: this.databaseService.poolStats(),
      }));
    } catch (error) {
      this.logger.warn(JSON.stringify({
        event: 'push_scheduler_db_failure',
        retryNextTick: true,
        pool: this.databaseService.poolStats(),
        ...describeDatabaseError(error, 'query'),
      }));
    } finally {
      this.processing = false;
    }
  }

  private async processQueueUnsafe() {
    const recovered = await this.db
      .update(pushNotificationJobs)
      .set({
        status: 'pending',
        nextRetryAt: new Date(),
        lastError: 'Recovered stale processing claim after worker interruption.',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(pushNotificationJobs.status, 'processing'),
          lte(pushNotificationJobs.updatedAt, new Date(Date.now() - 10 * 60_000)),
        ),
      )
      .returning({ id: pushNotificationJobs.id });
    if (recovered.length) this.logger.warn(JSON.stringify({
      event: 'push_stale_claims_recovered',
      count: recovered.length,
      jobIds: recovered.map((job) => job.id),
    }));
    await this.processReceipts();
    const jobs = await this.db
      .select()
      .from(pushNotificationJobs)
      .where(
        and(
          eq(pushNotificationJobs.status, 'pending'),
          lte(pushNotificationJobs.nextRetryAt, new Date()),
        ),
      )
      .orderBy(asc(pushNotificationJobs.nextRetryAt))
      .limit(100);
    if (!jobs.length) return;
    this.logger.log(JSON.stringify({ event: 'push_jobs_due', count: jobs.length, jobIds: jobs.map((job) => job.id) }));
    const claimed = [] as typeof jobs;
    for (const job of jobs) {
      const [row] = await this.db
        .update(pushNotificationJobs)
        .set({ status: 'processing', updatedAt: new Date() })
        .where(
          and(
            eq(pushNotificationJobs.id, job.id),
            eq(pushNotificationJobs.status, 'pending'),
          ),
        )
        .returning();
      if (row) claimed.push(row);
    }
    for (let index = 0; index < claimed.length; index += 100) {
      const batch = claimed.slice(index, index + 100);
      try {
        const response = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(
            batch.map(createExpoPushMessage),
          ),
        });
        if (!response.ok)
          throw new Error(`Expo push service returned ${response.status}`);
        const result = (await response.json()) as {
          data?: Array<{
            status: string;
            id?: string;
            message?: string;
            details?: { error?: string };
          }>;
        };
        for (let i = 0; i < batch.length; i += 1) {
          this.logger.log(JSON.stringify({ event: 'expo_ticket', jobId: batch[i].id, status: result.data?.[i]?.status, ticketId: result.data?.[i]?.id ?? null, error: result.data?.[i]?.details?.error ?? null }));
          await this.handleTicket(batch[i], result.data?.[i]);
        }
      } catch (error) {
        for (const job of batch)
          await this.retry(
            job,
            error instanceof Error ? error.message : 'Expo push failed',
          );
      }
    }
  }

  private async processReceipts() {
    const sent = await this.db
      .select()
      .from(pushNotificationJobs)
      .where(
        and(
          eq(pushNotificationJobs.status, 'sent'),
          lte(pushNotificationJobs.updatedAt, new Date(Date.now() - 10_000)),
        ),
      )
      .limit(100);
    const withTickets = sent.filter((job) => job.ticketId);
    if (!withTickets.length) return;
    try {
      const response = await fetch(EXPO_RECEIPTS_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids: withTickets.map((job) => job.ticketId) }),
      });
      if (!response.ok) {
        this.logger.warn(JSON.stringify({
          event: 'expo_receipts_request_failed',
          status: response.status,
          jobCount: withTickets.length,
        }));
        return;
      }
      const result = (await response.json()) as {
        data?: Record<
          string,
          { status: string; message?: string; details?: { error?: string } }
        >;
      };
      for (const job of withTickets) {
        const receipt = job.ticketId ? result.data?.[job.ticketId] : undefined;
        this.logger.log(JSON.stringify({ event: 'expo_receipt', jobId: job.id, ticketId: job.ticketId, status: receipt?.status ?? 'pending', error: receipt?.details?.error ?? null }));
        if (receipt?.details?.error === 'DeviceNotRegistered') {
          await this.db
            .update(userPushDevices)
            .set({ enabled: false, updatedAt: new Date() })
            .where(eq(userPushDevices.id, job.deviceId));
          await this.db
            .update(pushNotificationJobs)
            .set({
              status: 'invalid_token',
              lastError: 'DeviceNotRegistered',
              updatedAt: new Date(),
            })
            .where(eq(pushNotificationJobs.id, job.id));
        } else if (receipt?.status === 'ok') {
          await this.db
            .update(pushNotificationJobs)
            .set({ status: 'delivered', lastError: null, updatedAt: new Date() })
            .where(eq(pushNotificationJobs.id, job.id));
        } else if (receipt?.status === 'error') {
          await this.db
            .update(pushNotificationJobs)
            .set({
              status: 'failed',
              lastError: (receipt.details?.error ?? receipt.message ?? 'Expo receipt rejected push').slice(0, 500),
              updatedAt: new Date(),
            })
            .where(eq(pushNotificationJobs.id, job.id));
        }
      }
    } catch (error) {
      this.logger.warn(JSON.stringify({
        event: 'expo_receipts_processing_failed',
        retryNextTick: true,
        pool: this.databaseService.poolStats(),
        ...describeDatabaseError(error, 'query'),
      }));
      /* receipt checks are best effort; the ticket already succeeded */
    }
  }

  private async handleTicket(
    job: typeof pushNotificationJobs.$inferSelect,
    ticket?: {
      status: string;
      id?: string;
      message?: string;
      details?: { error?: string };
    },
  ) {
    const invalid =
      ticket?.details?.error === 'DeviceNotRegistered' ||
      /invalid.*token/i.test(ticket?.message ?? '');
    if (invalid) {
      await this.db
        .update(userPushDevices)
        .set({ enabled: false, updatedAt: new Date() })
        .where(eq(userPushDevices.id, job.deviceId));
      await this.db
        .update(pushNotificationJobs)
        .set({
          status: 'invalid_token',
          lastError:
            ticket?.details?.error ?? ticket?.message ?? 'Invalid push token',
          updatedAt: new Date(),
        })
        .where(eq(pushNotificationJobs.id, job.id));
      return;
    }
    if (ticket?.status === 'ok') {
      await this.db
        .update(pushNotificationJobs)
        .set({
          status: 'sent',
          ticketId: ticket.id ?? null,
          sentAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(pushNotificationJobs.id, job.id));
      return;
    }
    await this.retry(job, ticket?.message ?? 'Expo rejected push notification');
  }

  private async retry(
    job: typeof pushNotificationJobs.$inferSelect,
    message: string,
  ) {
    const attempt = job.attemptCount + 1;
    await this.db
      .update(pushNotificationJobs)
      .set({
        status: attempt >= 6 ? 'failed' : 'pending',
        attemptCount: attempt,
        nextRetryAt: new Date(
          Date.now() + Math.min(60 * 60_000, 5_000 * 2 ** (attempt - 1)),
        ),
        lastError: message.slice(0, 500),
        updatedAt: new Date(),
      })
      .where(eq(pushNotificationJobs.id, job.id));
  }

  private async quietUntil(
    userId: string,
    now: Date,
    executor: PushDatabaseExecutor = this.db,
  ): Promise<Date | null> {
    const [row] = await executor
      .select({
        sleepStart: plannerPreferences.sleepStartTime,
        sleepEnd: plannerPreferences.sleepEndTime,
        timezone: users.timezone,
      })
      .from(plannerPreferences)
      .innerJoin(users, eq(users.id, plannerPreferences.userId))
      .where(eq(plannerPreferences.userId, userId))
      .limit(1);
    if (!row) return null;
    const local = new Intl.DateTimeFormat('en-GB', {
      timeZone: row.timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(now);
    const [hour, minute] = local.split(':').map(Number);
    const current = hour * 60 + minute;
    const [startHour, startMinute] = row.sleepStart.split(':').map(Number);
    const [endHour, endMinute] = row.sleepEnd.split(':').map(Number);
    const start = startHour * 60 + startMinute;
    const end = endHour * 60 + endMinute;
    const quiet =
      start > end
        ? current >= start || current < end
        : current >= start && current < end;
    if (!quiet) return null;
    const minutes = current < end ? end - current : 24 * 60 - current + end;
    return new Date(now.getTime() + minutes * 60_000);
  }
}
