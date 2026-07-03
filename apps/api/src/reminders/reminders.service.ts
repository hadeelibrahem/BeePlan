import { Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service';
import { reminders as remindersTable } from '../db/schema';
import { CreateReminderDto } from './dto/create-reminder.dto';
import type {
  ReminderChecklistItemDto,
  ReminderContextDto,
  ReminderLocationDto,
} from './dto/reminder-shared.dto';
import { UpdateReminderDto } from './dto/update-reminder.dto';
import { Reminder } from './entities/reminder.entity';

type ReminderRow = typeof remindersTable.$inferSelect;

@Injectable()
export class RemindersService {
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  private toEntity(row: ReminderRow): Reminder {
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
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async create(dto: CreateReminderDto, userId: string): Promise<Reminder> {
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
      })
      .returning();

    return this.toEntity(row);
  }

  async findAll(userId: string): Promise<Reminder[]> {
    const rows = await this.db
      .select()
      .from(remindersTable)
      .where(eq(remindersTable.userId, userId));

    return rows.map((row) => this.toEntity(row));
  }

  async findOne(id: string, userId: string): Promise<Reminder> {
    const [row] = await this.db
      .select()
      .from(remindersTable)
      .where(
        and(eq(remindersTable.id, id), eq(remindersTable.userId, userId)),
      );

    if (!row) {
      throw new NotFoundException(`Reminder with id ${id} not found`);
    }

    return this.toEntity(row);
  }

  async update(
    id: string,
    dto: UpdateReminderDto,
    userId: string,
  ): Promise<Reminder> {
    await this.findOne(id, userId);

    const [row] = await this.db
      .update(remindersTable)
      .set({
        ...dto,
        triggerDateTime: dto.triggerDateTime
          ? new Date(dto.triggerDateTime)
          : undefined,
        repeatEndDate: dto.repeatEndDate
          ? new Date(dto.repeatEndDate)
          : undefined,
        updatedAt: new Date(),
      })
      .where(
        and(eq(remindersTable.id, id), eq(remindersTable.userId, userId)),
      )
      .returning();

    if (!row) {
      throw new NotFoundException(`Reminder with id ${id} not found`);
    }

    return this.toEntity(row);
  }

  async remove(id: string, userId: string): Promise<void> {
    await this.findOne(id, userId);
    await this.db
      .delete(remindersTable)
      .where(
        and(eq(remindersTable.id, id), eq(remindersTable.userId, userId)),
      );
  }
}
