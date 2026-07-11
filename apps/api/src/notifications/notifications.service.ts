import { Injectable } from '@nestjs/common';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service';
import { notifications, users } from '../db/schema';
import type { NotificationQueryDto } from './dto/notification-query.dto';
import type { NotificationType } from './notification-types';

type NotificationRow = typeof notifications.$inferSelect;

export type CreateNotificationInput = {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  taskId?: string | null;
  actorId?: string | null;
  data?: Record<string, unknown> | null;
};

const DEFAULT_PAGE_SIZE = 20;

@Injectable()
export class NotificationsService {
  constructor(private readonly databaseService: DatabaseService) {}

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
  ): Promise<void> {
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
        data: input.data ?? null,
      }));

    if (!rows.length) return;
    await this.db.insert(notifications).values(rows);
  }

  async create(input: CreateNotificationInput): Promise<void> {
    await this.createMany([input]);
  }

  async list(userId: string, query?: NotificationQueryDto) {
    const page = Math.max(1, query?.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query?.pageSize ?? DEFAULT_PAGE_SIZE));
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
      ...new Set(pageRows.map((row) => row.actorId).filter(Boolean) as string[]),
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
      items: pageRows.map((row) => this.toEntity(row, actorById.get(row.actorId ?? ''))),
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
