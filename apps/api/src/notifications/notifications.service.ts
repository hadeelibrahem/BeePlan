import { Injectable, Optional } from '@nestjs/common';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service';
import {
  notificationDeliveries,
  notifications,
  personalTaskPreferences,
  userNotificationPreferences,
  users,
} from '../db/schema';
import type { NotificationQueryDto } from './dto/notification-query.dto';
import type { NotificationType } from './notification-types';
import {
  getNotificationCategory,
  isPreferenceBypass,
} from './notification-category';
import type { NotificationPreferences } from './notification-preferences.types';
import { PushNotificationsService } from './push-notifications.service';
import type { PushPriority } from './push-eligibility';

type NotificationRow = typeof notifications.$inferSelect;

export type CreateNotificationInput = {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  taskId?: string | null;
  actorId?: string | null;
  priority?: PushPriority;
  data?: Record<string, unknown> | null;
};

export type NotificationCreateResult = { inserted: number; skipped: number };

export type NotificationDeliveryIdentity = {
  entityType: string;
  entityId: string;
  triggerAt: Date;
  key?: string;
};

const DEFAULT_PAGE_SIZE = 20;

@Injectable()
export class NotificationsService {
  constructor(
    private readonly databaseService: DatabaseService,
    @Optional() private readonly pushNotifications?: PushNotificationsService,
  ) {}

  private readonly preferenceCache = new Map<
    string,
    { value: NotificationPreferences; expiresAt: number }
  >();
  private readonly muteCache = new Map<
    string,
    { value: boolean; expiresAt: number }
  >();

  private get db() {
    return this.databaseService.db;
  }

  /**
   * Fan-out helper: insert one notification per recipient in a single round
   * trip. Recipients are de-duplicated and any falsy id is dropped, so callers
   * can pass a raw member list (including the actor) without pre-filtering —
   * pass `excludeUserId` to skip the person who triggered the event.
   */
  async createMany(
    inputs: CreateNotificationInput[],
    excludeUserId?: string,
  ): Promise<NotificationCreateResult> {
    const seen = new Set<string>();
    const rows = inputs
      .filter((input) => {
        if (!input.userId || input.userId === excludeUserId) return false;
        const key = `${input.userId}:${input.type}:${input.taskId ?? ''}:${
          input.data ? JSON.stringify(input.data) : ''
        }`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((input) => ({
        userId: input.userId,
        notificationType: input.type,
        title: input.title,
        body: input.body,
        taskId: input.taskId ?? null,
        actorId: input.actorId ?? null,
        data: input.priority
          ? { ...(input.data ?? {}), priority: input.priority }
          : (input.data ?? null),
      }));

    if (!rows.length) return { inserted: 0, skipped: 0 };
    const allowed = [] as typeof rows;
    let skipped = 0;
    for (const row of rows) {
      const type = row.notificationType as NotificationType;
      if (!(await this.isAllowed(row.userId, type, row.taskId))) {
        skipped += 1;
        continue;
      }
      allowed.push(row);
    }
    if (!allowed.length) return { inserted: 0, skipped };
    const inserted = await this.db
      .insert(notifications)
      .values(allowed)
      .returning({ id: notifications.id });
    for (let index = 0; index < inserted.length; index += 1) {
      const input = allowed[index];
      if (input)
        void this.pushNotifications
          ?.enqueueForNotification(inserted[index].id, {
            userId: input.userId,
            type: input.notificationType as NotificationType,
            title: input.title,
            body: input.body,
            taskId: input.taskId,
            actorId: input.actorId,
            data: input.data as Record<string, unknown> | null,
          })
          .catch(() => undefined);
    }
    return { inserted: inserted.length, skipped };
  }

  async create(
    input: CreateNotificationInput,
  ): Promise<NotificationCreateResult> {
    return this.createMany([input]);
  }

  /**
   * Insert a notification once for a durable domain event. The delivery row is
   * claimed with a unique constraint, so retries and multiple worker instances
   * converge on one inbox notification.
   */
  async createOnce(
    input: CreateNotificationInput,
    identity: NotificationDeliveryIdentity,
  ): Promise<NotificationCreateResult> {
    if (!(await this.isAllowed(input.userId, input.type, input.taskId))) {
      return { inserted: 0, skipped: 1 };
    }
    const deliveryKey =
      identity.key ??
      [
        input.userId,
        input.type,
        identity.entityType,
        identity.entityId,
        identity.triggerAt.toISOString(),
      ].join(':');
    const [claimed] = await this.db
      .insert(notificationDeliveries)
      .values({
        userId: input.userId,
        notificationType: input.type,
        entityType: identity.entityType,
        entityId: identity.entityId,
        triggerAt: identity.triggerAt,
        deliveryKey,
      })
      .onConflictDoNothing({ target: notificationDeliveries.deliveryKey })
      .returning({ id: notificationDeliveries.id });
    if (!claimed) return { inserted: 0, skipped: 1 };
    return this.create(input);
  }

  private async isAllowed(
    userId: string,
    type: NotificationType,
    taskId?: string | null,
  ) {
    if (isPreferenceBypass(type)) return true;
    const preferences = await this.getOrCreatePreferences(userId);
    const category = getNotificationCategory(type);
    const enabled =
      category === 'task'
        ? preferences.taskNotifications
        : category === 'calendar'
          ? preferences.calendarNotifications
          : category === 'focus'
            ? preferences.focusNotifications
            : category === 'collaboration'
              ? preferences.collaborationNotifications
              : preferences.aiNotifications;
    return (
      enabled &&
      !(
        category === 'collaboration' &&
        taskId &&
        (await this.isTaskMuted(userId, taskId))
      )
    );
  }

  async getOrCreatePreferences(
    userId: string,
  ): Promise<NotificationPreferences> {
    const cached = this.preferenceCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    let [row] = await this.db
      .select()
      .from(userNotificationPreferences)
      .where(eq(userNotificationPreferences.userId, userId))
      .limit(1);
    if (!row)
      [row] = await this.db
        .insert(userNotificationPreferences)
        .values({ userId })
        .onConflictDoNothing({ target: userNotificationPreferences.userId })
        .returning();
    if (!row)
      [row] = await this.db
        .select()
        .from(userNotificationPreferences)
        .where(eq(userNotificationPreferences.userId, userId))
        .limit(1);
    if (!row) throw new Error('Unable to initialize notification preferences.');
    this.preferenceCache.set(userId, {
      value: row,
      expiresAt: Date.now() + 30_000,
    });
    return row;
  }

  async updatePreferences(
    userId: string,
    patch: Partial<
      Pick<
        NotificationPreferences,
        | 'taskNotifications'
        | 'calendarNotifications'
        | 'focusNotifications'
        | 'collaborationNotifications'
        | 'aiNotifications'
        | 'emailNotifications'
        | 'pushNotifications'
      >
    >,
  ) {
    await this.getOrCreatePreferences(userId);
    const [row] = await this.db
      .update(userNotificationPreferences)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(userNotificationPreferences.userId, userId))
      .returning();
    this.preferenceCache.delete(userId);
    return row;
  }

  private async isTaskMuted(userId: string, taskId: string) {
    const key = `${userId}:${taskId}`;
    const cached = this.muteCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const [row] = await this.db
      .select({ muted: personalTaskPreferences.notificationsMuted })
      .from(personalTaskPreferences)
      .where(
        and(
          eq(personalTaskPreferences.userId, userId),
          eq(personalTaskPreferences.taskId, taskId),
        ),
      )
      .limit(1);
    const value = row?.muted ?? false;
    this.muteCache.set(key, { value, expiresAt: Date.now() + 30_000 });
    return value;
  }

  async list(userId: string, query?: NotificationQueryDto) {
    const page = Math.max(1, query?.page ?? 1);
    const pageSize = Math.min(
      100,
      Math.max(1, query?.pageSize ?? DEFAULT_PAGE_SIZE),
    );
    const unreadOnly = query?.unreadOnly === 'true';

    const conditions = [eq(notifications.userId, userId)];
    if (unreadOnly) conditions.push(eq(notifications.isRead, false));

    const rows = await this.db
      .select()
      .from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.sentAt))
      .limit(pageSize + 1)
      .offset((page - 1) * pageSize);

    const hasMore = rows.length > pageSize;
    const pageRows = hasMore ? rows.slice(0, pageSize) : rows;

    // Resolve actor display info in one batched query (avoids an N+1 join).
    const actorIds = [
      ...new Set(
        pageRows.map((row) => row.actorId).filter(Boolean) as string[],
      ),
    ];
    const actors = actorIds.length
      ? await this.db
          .select({
            id: users.id,
            fullName: users.fullName,
            avatarUrl: users.avatarUrl,
          })
          .from(users)
          .where(inArray(users.id, actorIds))
      : [];
    const actorById = new Map(actors.map((actor) => [actor.id, actor]));

    return {
      items: pageRows.map((row) =>
        this.toEntity(row, actorById.get(row.actorId ?? '')),
      ),
      page,
      pageSize,
      hasMore,
    };
  }

  async unreadCount(userId: string): Promise<{ count: number }> {
    const [row] = await this.db
      .select({ value: count() })
      .from(notifications)
      .where(
        and(eq(notifications.userId, userId), eq(notifications.isRead, false)),
      );
    return { count: Number(row?.value ?? 0) };
  }

  async markRead(userId: string, notificationId: string) {
    await this.db
      .update(notifications)
      .set({ isRead: true })
      .where(
        and(
          eq(notifications.id, notificationId),
          eq(notifications.userId, userId),
        ),
      );
    return { success: true };
  }

  async markAllRead(userId: string) {
    await this.db
      .update(notifications)
      .set({ isRead: true })
      .where(
        and(eq(notifications.userId, userId), eq(notifications.isRead, false)),
      );
    return { success: true };
  }

  private toEntity(
    row: NotificationRow,
    actor?: { id: string; fullName: string; avatarUrl: string | null },
  ) {
    return {
      id: row.id,
      type: row.notificationType,
      title: row.title,
      body: row.body,
      taskId: row.taskId ?? undefined,
      data: (row.data as Record<string, unknown> | null) ?? undefined,
      isRead: row.isRead,
      actor: actor
        ? {
            id: actor.id,
            fullName: actor.fullName,
            avatarUrl: actor.avatarUrl ?? undefined,
          }
        : undefined,
      sentAt: row.sentAt.toISOString(),
    };
  }
}
