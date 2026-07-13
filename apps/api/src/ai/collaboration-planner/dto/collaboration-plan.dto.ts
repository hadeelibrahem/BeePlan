import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  ACTIVITY_TYPES,
  COLLABORATION_TASK_TYPES,
  PLAN_PRIORITIES,
} from '../collaboration-plan.types';

export const WORKLOAD_DISTRIBUTIONS = ['equal', 'availability', 'role', 'custom'] as const;
export type WorkloadDistribution = (typeof WORKLOAD_DISTRIBUTIONS)[number];

export const TASK_GRANULARITIES = ['coarse', 'medium', 'fine'] as const;
export type TaskGranularity = (typeof TASK_GRANULARITIES)[number];

export const TASK_TYPE_OVERRIDES = ['auto', ...COLLABORATION_TASK_TYPES] as const;
export type TaskTypeOverride = (typeof TASK_TYPE_OVERRIDES)[number];

export class CollaborationPlanPreferencesDto {
  @IsOptional()
  @IsIn(WORKLOAD_DISTRIBUTIONS)
  workloadDistribution?: WorkloadDistribution;

  // Overrides the automatic "shared outcome" (exam prep, studying, ...) vs
  // "divisible" (docs, screens, features, ...) classification heuristic —
  // the owner knows their task better than a keyword match ever will.
  @IsOptional()
  @IsIn(TASK_TYPE_OVERRIDES)
  taskType?: TaskTypeOverride;

  @IsOptional()
  @IsBoolean()
  includeOwner?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxWorkloadItemsPerPerson?: number;

  @IsOptional()
  @IsBoolean()
  allowParallelWork?: boolean;

  @IsOptional()
  @IsBoolean()
  addReviewSteps?: boolean;

  @IsOptional()
  @IsBoolean()
  addBufferTime?: boolean;

  @IsOptional()
  @IsIn(TASK_GRANULARITIES)
  taskGranularity?: TaskGranularity;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class GenerateCollaborationPlanDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  selectedMemberIds!: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => CollaborationPlanPreferencesDto)
  preferences?: CollaborationPlanPreferencesDto;
}

export class CollaborationPlanItemInputDto {
  @IsString()
  @MaxLength(64)
  proposalId!: string;

  @IsString()
  @MaxLength(255)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsUUID('4')
  assigneeUserId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(20160)
  estimatedDurationMinutes?: number;

  @IsOptional()
  @IsISO8601()
  suggestedStart?: string;

  @IsOptional()
  @IsISO8601()
  suggestedDue?: string;

  @IsOptional()
  @IsIn(PLAN_PRIORITIES)
  priority?: string;

  @IsOptional()
  @IsInt()
  order?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dependsOnProposalIds?: string[];

  @IsOptional()
  @IsBoolean()
  canRunInParallel?: boolean;

  // Carried through from the generated proposal so apply-time semantic dedup
  // and provenance can use the same identity the plan already computed,
  // instead of guessing from title text.
  @IsOptional()
  @IsIn(ACTIVITY_TYPES)
  activityType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  sharedSessionId?: string | null;
}

export class ApplyCollaborationPlanDto {
  // The generating proposal's id — stored as subtask provenance so a later
  // apply can identify and replace its own prior output.
  @IsUUID('4')
  planId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CollaborationPlanItemInputDto)
  items!: CollaborationPlanItemInputDto[];
}
