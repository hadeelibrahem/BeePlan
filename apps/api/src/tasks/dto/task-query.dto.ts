import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { TASK_PRIORITIES, TASK_STATUSES } from './task-shared.dto';

export const TASK_DUE_FILTERS = ['today', 'upcoming', 'overdue'] as const;
export type TaskDueFilter = (typeof TASK_DUE_FILTERS)[number];

// Query params arrive as strings (e.g. `?focus=true`), so plain
// `@Type(() => Boolean)` would coerce the string "false" to `true` (any
// non-empty string is truthy). This only treats the literal "true" as true.
const toBoolean = ({ value }: { value: unknown }) =>
  value === true || value === 'true';

export class TaskQueryDto {
  @IsOptional()
  @IsIn(TASK_STATUSES)
  status?: (typeof TASK_STATUSES)[number];

  @IsOptional()
  @IsIn(TASK_PRIORITIES)
  priority?: (typeof TASK_PRIORITIES)[number];

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsIn(TASK_DUE_FILTERS)
  due?: TaskDueFilter;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  focus?: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  completed?: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  hasReminder?: boolean;

  // "Shared with me / collaborative" quick filter — limits the list to tasks
  // the user is an accepted member of (not their own personal tasks).
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  shared?: boolean;

  @IsOptional()
  @IsString()
  search?: string;
}
