import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, count, desc, eq, inArray, isNull } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service';
import {
  taskCommentMentions,
  taskComments,
  tasks,
  users,
} from '../db/schema';
import { NotificationsService } from '../notifications/notifications.service';
import type {
  CreateCommentDto,
  PaginationQueryDto,
  UpdateCommentDto,
} from './dto/collaboration.dto';
import { TaskAccessService } from './task-access.service';
import { TaskActivityService } from './task-activity.service';

type CommentRow = typeof taskComments.$inferSelect;

const DEFAULT_PAGE_SIZE = 20;

@Injectable()
export class TaskCommentsService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly access: TaskAccessService,
    private readonly notifications: NotificationsService,
    private readonly activity: TaskActivityService,
  ) {}

  private get db() {
    return this.databaseService.db;
  }

  /** Any member (viewer or above) can comment. */
  async create(userId: string, taskId: string, dto: CreateCommentDto) {
    const { task } = await this.access.require(userId, taskId, 'viewer');

    const [comment] = await this.db
      .insert(taskComments)
      .values({ taskId, userId, message: dto.message.trim() })
      .returning();

    const mentionIds = await this.persistMentions(
      taskId,
      comment.id,
      dto.mentionedUserIds,
    );

    const author = await this.getUser(userId);
    const recipients = await this.access.getRecipientIds(taskId);

    // Comment notification to everyone except the author and anyone who is
    // separately getting a (higher-signal) mention notification.
    const mentionSet = new Set(mentionIds);
    await this.notifications.createMany(
      recipients
        .filter((id) => id !== userId && !mentionSet.has(id))
        .map((recipientId) => ({
          userId: recipientId,
          type: 'comment_added' as const,
          actorId: userId,
          taskId,
          title: 'New comment',
          body: `${author.fullName} commented on "${task.title}".`,
          data: { commentId: comment.id },
        })),
    );
    await this.notifications.createMany(
      mentionIds.map((mentionedId) => ({
        userId: mentionedId,
        type: 'mention' as const,
        actorId: userId,
        taskId,
        title: 'You were mentioned',
        body: `${author.fullName} mentioned you on "${task.title}".`,
        data: { commentId: comment.id },
      })),
      userId,
    );

    await this.activity.log(
      userId,
      taskId,
      'comment_added',
      `${author.fullName} commented`,
      { commentId: comment.id },
    );

    return this.toEntity(comment, author, mentionIds);
  }

  async list(userId: string, taskId: string, query?: PaginationQueryDto) {
    await this.access.require(userId, taskId, 'viewer');
    const page = Math.max(1, query?.page ?? 1);
    const pageSize = Math.min(
      100,
      Math.max(1, query?.pageSize ?? DEFAULT_PAGE_SIZE),
    );

    const where = and(
      eq(taskComments.taskId, taskId),
      isNull(taskComments.deletedAt),
    );

    const [rows, [totalRow]] = await Promise.all([
      this.db
        .select()
        .from(taskComments)
        .where(where)
        .orderBy(desc(taskComments.createdAt))
        .limit(pageSize + 1)
        .offset((page - 1) * pageSize),
      this.db.select({ value: count() }).from(taskComments).where(where),
    ]);

    const hasMore = rows.length > pageSize;
    const pageRows = hasMore ? rows.slice(0, pageSize) : rows;

    const authorIds = [...new Set(pageRows.map((row) => row.userId))];
    const commentIds = pageRows.map((row) => row.id);
    const [profiles, mentions] = await Promise.all([
      this.loadProfiles(authorIds),
      commentIds.length
        ? this.db
            .select()
            .from(taskCommentMentions)
            .where(inArray(taskCommentMentions.commentId, commentIds))
        : Promise.resolve([]),
    ]);
    const mentionsByComment = new Map<string, string[]>();
    for (const mention of mentions) {
      const list = mentionsByComment.get(mention.commentId) ?? [];
      list.push(mention.mentionedUserId);
      mentionsByComment.set(mention.commentId, list);
    }

    return {
      items: pageRows.map((row) =>
        this.toEntity(
          row,
          profiles.get(row.userId),
          mentionsByComment.get(row.id) ?? [],
        ),
      ),
      page,
      pageSize,
      total: Number(totalRow?.value ?? 0),
      hasMore,
    };
  }

  /** Only the author may edit their own comment. */
  async update(userId: string, commentId: string, dto: UpdateCommentDto) {
    const comment = await this.getLiveComment(commentId);
    if (comment.userId !== userId) {
      throw new ForbiddenException('You can only edit your own comments.');
    }

    const [row] = await this.db
      .update(taskComments)
      .set({ message: dto.message.trim(), editedAt: new Date(), updatedAt: new Date() })
      .where(eq(taskComments.id, commentId))
      .returning();

    // Re-sync mentions; notify only the newly added ones.
    const existing = await this.db
      .select()
      .from(taskCommentMentions)
      .where(eq(taskCommentMentions.commentId, commentId));
    const previous = new Set(existing.map((m) => m.mentionedUserId));

    await this.db
      .delete(taskCommentMentions)
      .where(eq(taskCommentMentions.commentId, commentId));
    const mentionIds = await this.persistMentions(
      comment.taskId,
      commentId,
      dto.mentionedUserIds,
    );

    const newlyMentioned = mentionIds.filter((id) => !previous.has(id));
    if (newlyMentioned.length) {
      const [author, task] = await Promise.all([
        this.getUser(userId),
        this.getTask(comment.taskId),
      ]);
      await this.notifications.createMany(
        newlyMentioned.map((mentionedId) => ({
          userId: mentionedId,
          type: 'mention' as const,
          actorId: userId,
          taskId: comment.taskId,
          title: 'You were mentioned',
          body: `${author.fullName} mentioned you on "${task?.title ?? 'a task'}".`,
          data: { commentId },
        })),
        userId,
      );
    }

    const author = await this.getUser(userId);
    return this.toEntity(row, author, mentionIds);
  }

  /** The author or the task owner may delete a comment (soft delete). */
  async remove(userId: string, commentId: string) {
    const comment = await this.getLiveComment(commentId);
    if (comment.userId !== userId) {
      // Not the author — must be the task owner.
      await this.access.require(userId, comment.taskId, 'owner');
    }
    await this.db
      .update(taskComments)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(taskComments.id, commentId));
    return { success: true };
  }

  /** Persists mentions, keeping only ids that are actual members of the task. */
  private async persistMentions(
    taskId: string,
    commentId: string,
    requestedIds?: string[],
  ): Promise<string[]> {
    if (!requestedIds?.length) return [];
    const memberIds = new Set(await this.access.getRecipientIds(taskId));
    const valid = [...new Set(requestedIds)].filter((id) => memberIds.has(id));
    if (!valid.length) return [];
    await this.db
      .insert(taskCommentMentions)
      .values(valid.map((mentionedUserId) => ({ commentId, mentionedUserId })))
      .onConflictDoNothing();
    return valid;
  }

  private async getLiveComment(commentId: string): Promise<CommentRow> {
    const [comment] = await this.db
      .select()
      .from(taskComments)
      .where(
        and(eq(taskComments.id, commentId), isNull(taskComments.deletedAt)),
      );
    if (!comment) {
      throw new NotFoundException('Comment not found.');
    }
    return comment;
  }

  private async getTask(taskId: string) {
    const [task] = await this.db
      .select({ id: tasks.id, title: tasks.title })
      .from(tasks)
      .where(eq(tasks.id, taskId));
    return task;
  }

  private async getUser(userId: string) {
    const [user] = await this.db
      .select({
        id: users.id,
        fullName: users.fullName,
        avatarUrl: users.avatarUrl,
      })
      .from(users)
      .where(eq(users.id, userId));
    return user ?? { id: userId, fullName: 'Unknown', avatarUrl: null };
  }

  private async loadProfiles(
    userIds: string[],
  ): Promise<
    Map<string, { id: string; fullName: string; avatarUrl: string | null }>
  > {
    if (!userIds.length) return new Map();
    const rows = await this.db
      .select({
        id: users.id,
        fullName: users.fullName,
        avatarUrl: users.avatarUrl,
      })
      .from(users)
      .where(inArray(users.id, userIds));
    return new Map(rows.map((row) => [row.id, row]));
  }

  private toEntity(
    row: CommentRow,
    author?: { id: string; fullName: string; avatarUrl: string | null },
    mentionedUserIds: string[] = [],
  ) {
    return {
      id: row.id,
      taskId: row.taskId,
      message: row.message,
      author: author
        ? {
            id: author.id,
            fullName: author.fullName,
            avatarUrl: author.avatarUrl ?? undefined,
          }
        : undefined,
      mentionedUserIds,
      isEdited: Boolean(row.editedAt),
      editedAt: row.editedAt?.toISOString() ?? undefined,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
