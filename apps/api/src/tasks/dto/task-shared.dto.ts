import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export const TASK_STATUSES = ['todo', 'in_progress', 'done', 'missed'] as const;
export const RECURRENCE_FREQUENCIES = [
  'Never',
  'Daily',
  'Weekly',
  'Monthly',
  'Yearly',
  'Custom',
] as const;
export const RECURRENCE_END_TYPES = ['never', 'date', 'occurrences'] as const;
export const RECURRENCE_CUSTOM_UNITS = ['days', 'weeks', 'months'] as const;
export const WEEKDAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];
export type RecurrenceEndType = (typeof RECURRENCE_END_TYPES)[number];
export type RecurrenceCustomUnit = (typeof RECURRENCE_CUSTOM_UNITS)[number];

export class TaskAttachmentDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  size?: string;

  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsString()
  type?: string;
}

export class TaskRecurrenceDto {
  @IsIn(RECURRENCE_FREQUENCIES)
  frequency!: RecurrenceFrequency;

  @IsOptional()
  @IsArray()
  @IsIn(WEEKDAYS, { each: true })
  weekdays?: string[];

  @IsOptional()
  @IsIn(['sameDay', 'lastDay'])
  monthlyMode?: 'sameDay' | 'lastDay';

  @IsOptional()
  @IsInt()
  @Min(1)
  customInterval?: number;

  @IsOptional()
  @IsIn(RECURRENCE_CUSTOM_UNITS)
  customUnit?: RecurrenceCustomUnit;

  @IsIn(RECURRENCE_END_TYPES)
  endType!: RecurrenceEndType;

  @IsOptional()
  @IsISO8601()
  endDate?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  occurrences?: number;
}

export class SubtaskDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsBoolean()
  isDone?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  orderIndex?: number;

  @IsOptional()
  @IsString()
  assignee?: string;

  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

export class TaskCoreDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(TASK_PRIORITIES)
  priority?: TaskPriority;

  @IsOptional()
  @IsIn(TASK_STATUSES)
  status?: TaskStatus;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  progress?: number;

  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @IsOptional()
  @IsString()
  dueTime?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  estimatedTimeMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  spentTimeMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  remainingTimeMinutes?: number;

  @IsOptional()
  @IsBoolean()
  reminderEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  reminderBeforeMinutes?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  labels?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TaskAttachmentDto)
  attachments?: TaskAttachmentDto[];

  @IsOptional()
  @IsBoolean()
  isFavorite?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubtaskDto)
  subtasks?: SubtaskDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => TaskRecurrenceDto)
  recurrence?: TaskRecurrenceDto | null;
}

export class DependencyTaskIdsDto {
  @IsArray()
  @IsUUID('4', { each: true })
  dependencyTaskIds!: string[];
}

export class ReplaceDependencyDto {
  @IsUUID('4')
  replacementTaskId!: string;
}

export class TaskProgressDto {
  @IsInt()
  @Min(0)
  @Max(100)
  progress!: number;
}

export class TaskStatusDto {
  @IsIn(TASK_STATUSES)
  status!: TaskStatus;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  progress?: number;

  @IsOptional()
  @IsString()
  missedReason?: string;

  @IsOptional()
  @IsISO8601()
  completionDate?: string;
}

export class TaskLabelDto {
  @IsString()
  name!: string;
}

export class TaskTimeEstimationDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  estimatedHours!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  spentHours!: number;
}
