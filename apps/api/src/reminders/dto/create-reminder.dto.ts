import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsISO8601,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  REMINDER_PRIORITIES,
  REMINDER_REPEATS,
  REMINDER_STATUSES,
  REMINDER_TYPES,
  ReminderChecklistItemDto,
  ReminderContextDto,
  ReminderLocationDto,
  ReminderPersonDto,
} from './reminder-shared.dto';
import type {
  ReminderPriority,
  ReminderRepeat,
  ReminderStatus,
  ReminderType,
} from './reminder-shared.dto';

export class CreateReminderDto {
  @IsString()
  title!: string;

  @IsIn(REMINDER_TYPES)
  type!: ReminderType;

  @IsOptional()
  @IsISO8601()
  triggerDateTime?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  reminderBefore?: number;

  @IsIn(REMINDER_REPEATS)
  repeat!: ReminderRepeat;

  @IsOptional()
  @IsInt()
  @Min(1)
  repeatInterval?: number;

  @IsOptional()
  @IsString({ each: true })
  repeatDaysOfWeek?: string[];

  @IsOptional()
  @IsISO8601()
  repeatEndDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsIn(REMINDER_PRIORITIES)
  priority!: ReminderPriority;

  @IsOptional()
  @IsIn(REMINDER_STATUSES)
  status?: ReminderStatus;

  @IsOptional()
  @ValidateNested()
  @Type(() => ReminderLocationDto)
  location?: ReminderLocationDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ReminderContextDto)
  context?: ReminderContextDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReminderChecklistItemDto)
  checklistItems?: ReminderChecklistItemDto[];

  // Only honoured on PATCH /reminders/:id for existing person reminders (merged
  // onto the stored config). Ignored on create — person reminders are created
  // via POST /person-reminders.
  @IsOptional()
  @ValidateNested()
  @Type(() => ReminderPersonDto)
  person?: ReminderPersonDto;
}
