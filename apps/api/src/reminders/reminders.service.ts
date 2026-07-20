import { Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service';
import { reminders as remindersTable } from '../db/schema';
import { LocationSharingService } from '../social/location-sharing.service';
import { CreateReminderDto } from './dto/create-reminder.dto';
import type {
  ReminderChecklistItemDto,
  ReminderContextDto,
  ReminderLocationDto,
  ReminderPlaceCategory,
} from './dto/reminder-shared.dto';
import { UpdateReminderDto } from './dto/update-reminder.dto';
import { Reminder } from './entities/reminder.entity';

type ReminderRow = typeof remindersTable.$inferSelect;

type PersonConfig = {
  targetUserId?: string;
  targetName?: string;
  message?: string;
  radiusMeters?: number;
  cooldownMinutes?: number;
  permissionId?: string | null;
  lastNotifiedAt?: string | null;
  proximityState?: 'inside' | 'outside' | null;
  lastEnteredAt?: string | null;
  lastExitedAt?: string | null;
  lastTransitionAt?: string | null;
  completedAt?: string | null;
};

@Injectable()
export class RemindersService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly locationSharingService: LocationSharingService,
  ) {}

  private get db() {
    return this.databaseService.db;
  }

  /**
   * Enriches a person reminder's stored config with its live location-sharing
   * permission status plus a convenience `targetFriendName` alias, so the
   * Reminders page can render everything it needs without a second request.
   */
  private toEntity(
    row: ReminderRow,
    permissionStatuses?: Map<string, string>,
  ): Reminder {
    let person: Record<string, unknown> | undefined =
      (row.person as Record<string, unknown> | null) ?? undefined;

    if (row.type === 'person' && person) {
      const config = person as PersonConfig;
      const status =
        (config.targetUserId
          ? permissionStatuses?.get(config.targetUserId)
          : undefined) ?? 'pending';
      person = {
        ...person,
        targetFriendName: config.targetName,
        permissionStatus: status,
      };
    }

    return {
      id: row.id,
      title: row.title,
      type: row.type as Reminder['type'],
      triggerDateTime: row.triggerDateTime?.toISOString(),
      reminderBefore: row.reminderBefore ?? undefined,
      repeat: row.repeat as Reminder['repeat'],
      repeatInterval: row.repeatInterval ?? undefined,
      repeatDaysOfWeek: (row.repeatDaysOfWeek as string[] | null) ?? undefined,
      repeatEndDate: row.repeatEndDate?.toISOString(),
      notes: row.notes ?? undefined,
      priority: row.priority as Reminder['priority'],
      status: row.status as Reminder['status'],
      location: (row.location as ReminderLocationDto | null) ?? undefined,
      context: (row.context as ReminderContextDto | null) ?? undefined,
      checklistItems:
        (row.checklistItems as ReminderChecklistItemDto[] | null) ?? undefined,
      person,
      smartLocationEnabled: row.smartLocationEnabled ?? false,
      smartPlaceCategory:
        (row.smartPlaceCategory as ReminderPlaceCategory | null) ?? undefined,
      triggerRadius: row.triggerRadius ?? 200,
      triggerOnEnter: row.triggerOnEnter ?? true,
      triggerCooldown: row.triggerCooldown ?? 1440,
      lastTriggeredAt: row.lastTriggeredAt?.toISOString(),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async create(userId: string, dto: CreateReminderDto): Promise<Reminder> {
    const [row] = await this.db
      .insert(remindersTable)
      .values({
        userId,
        title: dto.title,
        type: dto.type,
        triggerDateTime: dto.triggerDateTime
          ? new Date(dto.triggerDateTime)
          : undefined,
        reminderBefore: dto.reminderBefore,
        repeat: dto.repeat,
        repeatInterval: dto.repeatInterval,
        repeatDaysOfWeek: dto.repeatDaysOfWeek,
        repeatEndDate: dto.repeatEndDate
          ? new Date(dto.repeatEndDate)
          : undefined,
        notes: dto.notes,
        priority: dto.priority,
        status: dto.status ?? 'active',
        location: dto.location,
        context: dto.context,
        checklistItems: dto.checklistItems,
        smartLocationEnabled: dto.smartLocationEnabled ?? false,
        smartPlaceCategory: dto.smartPlaceCategory,
        triggerRadius: dto.triggerRadius ?? 200,
        triggerOnEnter: dto.triggerOnEnter ?? true,
        triggerCooldown: dto.triggerCooldown ?? 1440,
        lastTriggeredAt: dto.lastTriggeredAt
          ? new Date(dto.lastTriggeredAt)
          : undefined,
      })
      .returning();

    return this.toEntity(row);
  }

  async findAll(userId: string): Promise<Reminder[]> {
    const rows = await this.db
      .select()
      .from(remindersTable)
      .where(eq(remindersTable.userId, userId));

    // Only pay for the permission lookup when the user actually has person
    // reminders — every other reminder type is unaffected.
    const hasPersonReminder = rows.some((row) => row.type === 'person');
    const permissionStatuses = hasPersonReminder
      ? await this.locationSharingService.getViewerPermissionStatuses(userId)
      : undefined;

    return rows.map((row) => this.toEntity(row, permissionStatuses));
  }

  async findOne(userId: string, id: string): Promise<Reminder> {
    const [row] = await this.db
      .select()
      .from(remindersTable)
      .where(and(eq(remindersTable.id, id), eq(remindersTable.userId, userId)));

    if (!row) {
      throw new NotFoundException(`Reminder with id ${id} not found`);
    }

    const permissionStatuses =
      row.type === 'person'
        ? await this.locationSharingService.getViewerPermissionStatuses(userId)
        : undefined;

    return this.toEntity(row, permissionStatuses);
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateReminderDto,
  ): Promise<Reminder> {
    const existing = await this.findOne(userId, id);

    // Person config is a partial patch: merge onto the stored config so
    // permission/targeting/proximity fields survive an edit that only changes
    // radius/notes/cooldown. Ignored for non-person reminders.
    const { person: personPatch, ...rest } = dto;
    let mergedPerson: PersonConfig | undefined;
    if (personPatch && existing.type === 'person') {
      const [raw] = await this.db
        .select({ person: remindersTable.person })
        .from(remindersTable)
        .where(
          and(eq(remindersTable.id, id), eq(remindersTable.userId, userId)),
        );
      mergedPerson = {
        ...((raw?.person as PersonConfig | null) ?? {}),
        ...personPatch,
      };
    }

    const [row] = await this.db
      .update(remindersTable)
      .set({
        ...rest,
        ...(mergedPerson ? { person: mergedPerson } : {}),
        triggerDateTime: dto.triggerDateTime
          ? new Date(dto.triggerDateTime)
          : undefined,
        repeatEndDate: dto.repeatEndDate
          ? new Date(dto.repeatEndDate)
          : undefined,
        lastTriggeredAt: dto.lastTriggeredAt
          ? new Date(dto.lastTriggeredAt)
          : undefined,
        updatedAt: new Date(),
      })
      .where(and(eq(remindersTable.id, id), eq(remindersTable.userId, userId)))
      .returning();

    if (!row) {
      throw new NotFoundException(`Reminder with id ${id} not found`);
    }

    return this.toEntity(row);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.findOne(userId, id);
    await this.db
      .delete(remindersTable)
      .where(and(eq(remindersTable.id, id), eq(remindersTable.userId, userId)));
  }
}
