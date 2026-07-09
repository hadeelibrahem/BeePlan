import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { FOCUS_SESSION_TYPES } from '../focus.logic';

export const FOCUS_TASK_OUTCOMES = ['done', 'partial', 'keep'] as const;
export type FocusTaskOutcome = (typeof FOCUS_TASK_OUTCOMES)[number];

export class StartFocusSessionDto {
  @IsOptional()
  @IsUUID()
  taskId?: string;

  @IsInt()
  @Min(1)
  @Max(600)
  plannedMinutes!: number;

  @IsOptional()
  @IsIn(FOCUS_SESSION_TYPES)
  sessionType?: (typeof FOCUS_SESSION_TYPES)[number];
}

export class FinishFocusSessionDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1440)
  actualMinutes?: number;

  @IsOptional()
  @IsIn(FOCUS_TASK_OUTCOMES)
  taskOutcome?: FocusTaskOutcome;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class CancelFocusSessionDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1440)
  actualMinutes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
