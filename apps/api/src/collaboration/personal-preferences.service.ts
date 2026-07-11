import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service';
import { personalTaskPreferences } from '../db/schema';
import type { PersonalPreferencesDto } from './dto/collaboration.dto';
import { TaskAccessService } from './task-access.service';

type PrefsRow = typeof personalTaskPreferences.$inferSelect;

const DEFAULTS = {
  isPinned: false,
  isFavorite: false,
  isFocusQueued: false,
  personalReminderMinutesBefore: undefined as number | undefined,
  notificationsMuted: false,
};

/**
 * Per-user, per-task settings that must never be shared between collaborators
 * (pin, favorite, focus-queue, personal reminder lead time, notification mute).
 * Any member — including viewers — can manage their own preferences.
 */
@Injectable()
export class PersonalPreferencesService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly access: TaskAccessService,
  ) {}

  private get db() {
    return this.databaseService.db;
  }

  async get(userId: string, taskId: string) {
    await this.access.require(userId, taskId, 'viewer');
    const [row] = await this.db
      .select()
      .from(personalTaskPreferences)
      .where(
        and(
          eq(personalTaskPreferences.taskId, taskId),
          eq(personalTaskPreferences.userId, userId),
        ),
      );
    return row ? this.toEntity(row) : { taskId, ...DEFAULTS };
  }

  async update(userId: string, taskId: string, dto: PersonalPreferencesDto) {
    await this.access.require(userId, taskId, 'viewer');

    const patch = {
      ...(dto.isPinned !== undefined && { isPinned: dto.isPinned }),
      ...(dto.isFavorite !== undefined && { isFavorite: dto.isFavorite }),
      ...(dto.isFocusQueued !== undefined && {
        isFocusQueued: dto.isFocusQueued,
      }),
      ...(dto.personalReminderMinutesBefore !== undefined && {
        personalReminderMinutesBefore: dto.personalReminderMinutesBefore,
      }),
      ...(dto.notificationsMuted !== undefined && {
        notificationsMuted: dto.notificationsMuted,
      }),
    };

    const [row] = await this.db
      .insert(personalTaskPreferences)
      .values({ taskId, userId, ...patch })
      .onConflictDoUpdate({
        target: [
          personalTaskPreferences.taskId,
          personalTaskPreferences.userId,
        ],
        set: { ...patch, updatedAt: new Date() },
      })
      .returning();

    return this.toEntity(row);
  }

  private toEntity(row: PrefsRow) {
    return {
      taskId: row.taskId,
      isPinned: row.isPinned,
      isFavorite: row.isFavorite,
      isFocusQueued: row.isFocusQueued,
      personalReminderMinutesBefore:
        row.personalReminderMinutesBefore ?? undefined,
      notificationsMuted: row.notificationsMuted,
    };
  }
}
