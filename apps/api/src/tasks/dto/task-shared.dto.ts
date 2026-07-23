import { Transform, Type } from 'class-transformer';
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
import { toApiDate } from '../../ai/recurrence-parser';
import { SUBTASK_VIEWS, type SubtaskView } from '../subtask-visibility';

// Defensive normalization for recurrence end dates: even if a client sends a
// display/localized date ("Aug 31, 2026", "August", "08/31/2026") or an empty
// string, coerce it to an ISO date (YYYY-MM-DD) before validation. Unparseable
// non-empty values are passed through so @IsISO8601 rejects them with a clear
// message.
function normalizeEndDateInput(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return toApiDate(value) ?? (typeof value === 'string' ? value : undefined);
}

export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export const TASK_STATUSES = ['todo', 'in_progress', 'done', 'missed'] as const;
export const SUBTASK_STATUSES = [
  'todo',
  'in_progress',
  'done',
  'blocked',
  'missed',
] as const;
export const SUBTASK_PRIORITIES = TASK_PRIORITIES;
export const DURATION_SOURCES = ['user', 'ai'] as const;
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
export type SubtaskStatus = (typeof SUBTASK_STATUSES)[number];
export type DurationSource = (typeof DURATION_SOURCES)[number];
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];
export type RecurrenceEndType = (typeof RECURRENCE_END_TYPES)[number];
export type RecurrenceCustomUnit = (typeof RECURRENCE_CUSTOM_UNITS)[number];

export class TaskAttachmentDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  size?: string;

  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  fileName?: string;

  @IsOptional()
  @IsString()
  fileUrl?: string;

  @IsOptional()
  @IsString()
  storagePath?: string;

  @IsOptional()
  @IsString()
  fileType?: string;

  @IsOptional()
  @IsString()
  fileSize?: string;

  @IsOptional()
  @IsString()
  uploadedAt?: string;
}

export class TaskRecurrenceDto {
  @IsIn(RECURRENCE_FREQUENCIES)
  frequency!: RecurrenceFrequency;

  @IsOptional()
  @IsArray()
  @IsIn(WEEKDAYS, { each: true })
  weekdays?: string[];

  @IsOptional()
  @IsIn(['sameDay', 'lastDay', 'firstWeekday'])
  monthlyMode?: 'sameDay' | 'lastDay' | 'firstWeekday';

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
  @Transform(({ value }) => normalizeEndDateInput(value))
  @IsISO8601(
    {},
    { message: 'Recurrence end date must be a valid date (YYYY-MM-DD).' },
  )
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
  @IsUUID('4')
  assigneeUserId?: string;

  // Explicit shared/team-wide flag. A shared subtask is visible to every
  // collaborator regardless of assignee (never inferred from the title).
  @IsOptional()
  @IsBoolean()
  isShared?: boolean;

  // Deep-work eligibility flag (mirrors the task-level isFocusTask). Explicit
  // only — the Focus recommender never infers this from duration/title/AI.
  @IsOptional()
  @IsBoolean()
  isFocusTask?: boolean;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(SUBTASK_PRIORITIES)
  priority?: TaskPriority;

  @IsOptional()
  @IsIn(SUBTASK_STATUSES)
  status?: SubtaskStatus;

  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  estimatedDurationMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  actualDurationMinutes?: number;

  @IsOptional()
  @IsIn(DURATION_SOURCES)
  estimatedDurationSource?: DurationSource;

  @IsOptional()
  @IsBoolean()
  reminderEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  reminderMinutesBeforeDue?: number;

  @IsOptional()
  @IsISO8601()
  reminderTime?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  dependencyIds?: string[];
}

export class SubtaskDependencyDto {
  @IsArray()
  @IsUUID('4', { each: true })
  dependsOnSubtaskIds!: string[];
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
  @IsBoolean()
  isFocusTask?: boolean;

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

export class SubtaskReorderDto {
  @IsArray()
  @IsUUID('4', { each: true })
  subtaskIds!: string[];
}

// Visibility-aware query for GET /tasks/:id/subtasks. `view` refines the
// role-filtered set; `assigneeId` targets the owner's "by member" filter.
export class SubtaskListQueryDto {
  @IsOptional()
  @IsIn(SUBTASK_VIEWS)
  view?: SubtaskView;

  @IsOptional()
  @IsUUID('4')
  assigneeId?: string;
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
