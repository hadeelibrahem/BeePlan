import { BadRequestException, Injectable } from '@nestjs/common';
import { and, desc, eq, or } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service';
import { reminders } from '../db/schema';
import type { TaskReminderDto } from './dto/collaboration.dto';
import { TaskAccessService } from './task-access.service';
import { TaskActivityService } from './task-activity.service';

type ReminderRow = typeof reminders.$inferSelect;

/**
 * Task-scoped reminders with two audiences:
 *  - shared   → fires for every accepted member; only editors/owner can set it.
 *  - personal → fires only for its creator; any member can set their own.
 *
 * Rows live in the existing `reminders` table (tagged with task_id + audience)
 * so the reminder scheduler picks them up with no separate pipeline.
 */
@Injectable()
export class TaskRemindersService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly access: TaskAccessService,
    private readonly activity: TaskActivityService,
  ) {}

  private get db() {
    return this.databaseService.db;
  }

  async createShared(userId: string, taskId: string, dto: TaskReminderDto) {
    const { task } = await this.access.require(userId, taskId, 'editor');
    const row = await this.insert(userId, taskId, task.title, dto, 'shared');
    await this.activity.log(
      userId,
      taskId,
      'reminder_updated',
      'Shared reminder added',
      { audience: 'shared', reminderId: row.id },
    );
    return this.toEntity(row);
  }

  async createPersonal(userId: string, taskId: string, dto: TaskReminderDto) {
    const { task } = await this.access.require(userId, taskId, 'viewer');
    const row = await this.insert(userId, taskId, task.title, dto, 'personal');
    return this.toEntity(row);
  }

  /** Shared reminders on the task + the caller's own personal reminders. */
  async list(userId: string, taskId: string) {
    await this.access.require(userId, taskId, 'viewer');
    const rows = await this.db
      .select()
      .from(reminders)
      .where(
        and(
          eq(reminders.taskId, taskId),
          or(
            eq(reminders.audience, 'shared'),
            and(
              eq(reminders.audience, 'personal'),
              eq(reminders.userId, userId),
            ),
          ),
        ),
      )
      .orderBy(desc(reminders.createdAt));
    return rows.map((row) => this.toEntity(row));
  }

  private async insert(
    userId: string,
    taskId: string,
    taskTitle: string,
    dto: TaskReminderDto,
    audience: 'shared' | 'personal',
  ): Promise<ReminderRow> {
    if (!dto.triggerDateTime && dto.reminderBeforeMinutes === undefined) {
      throw new BadRequestException(
        'A reminder needs either a trigger time or a lead time before the due date.',
      );
    }
    const [row] = await this.db
      .insert(reminders)
      .values({
        userId,
        taskId,
        audience,
        title: dto.title?.trim() || taskTitle,
        type: 'time',
        triggerDateTime: dto.triggerDateTime
          ? new Date(dto.triggerDateTime)
          : null,
        reminderBefore: dto.reminderBeforeMinutes ?? null,
        notes: dto.notes?.trim() || null,
      })
      .returning();
    return row;
  }

  private toEntity(row: ReminderRow) {
    return {
      id: row.id,
      taskId: row.taskId ?? undefined,
      audience: row.audience,
      title: row.title,
      triggerDateTime: row.triggerDateTime?.toISOString() ?? undefined,
      reminderBeforeMinutes: row.reminderBefore ?? undefined,
      notes: row.notes ?? undefined,
      createdBy: row.userId ?? undefined,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
