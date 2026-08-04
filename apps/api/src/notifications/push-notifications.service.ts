import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { and, asc, eq, lte } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service';
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

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';

function channelFor(type: string) {
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

@Injectable()
export class PushNotificationsService {
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
  ) {
    const requestedPriority =
      typeof input.data?.priority === 'string'
        ? (input.data.priority as 'high' | 'normal' | 'low')
        : undefined;
    const priority = requestedPriority ?? pushPriorityFor(input.type);
    if (!priority || !isPushEligible(input.type, priority)) return;
    const [preferences] = await this.db
      .select({ enabled: userNotificationPreferences.pushNotifications })
      .from(userNotificationPreferences)
      .where(eq(userNotificationPreferences.userId, input.userId))
      .limit(1);
    if (preferences && !preferences.enabled) return;
    const devices = await this.db
      .select()
      .from(userPushDevices)
      .where(
        and(
          eq(userPushDevices.userId, input.userId),
          eq(userPushDevices.enabled, true),
        ),
      );
    if (!devices.length) return;
    const quietUntil =
      priority === 'high'
        ? null
        : await this.quietUntil(input.userId, new Date());
    await this.db
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
      });
  }

  @Cron('* * * * *')
  async processQueue() {
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
            batch.map((job) => ({
              to: job.expoPushToken,
              title: job.title,
              body: job.body,
              sound: 'default',
              priority: job.priority,
              channelId:
                (job.payload as { channelId?: string }).channelId ?? 'tasks',
              data: job.payload,
            })),
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
        for (let i = 0; i < batch.length; i += 1)
          await this.handleTicket(batch[i], result.data?.[i]);
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
      if (!response.ok) return;
      const result = (await response.json()) as {
        data?: Record<
          string,
          { status: string; message?: string; details?: { error?: string } }
        >;
      };
      for (const job of withTickets) {
        const receipt = job.ticketId ? result.data?.[job.ticketId] : undefined;
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
        }
      }
    } catch {
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
      ticket?.details?.error === 'InvalidCredentials' ||
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

  private async quietUntil(userId: string, now: Date): Promise<Date | null> {
    const [row] = await this.db
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
