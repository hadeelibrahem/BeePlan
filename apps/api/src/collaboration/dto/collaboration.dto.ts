import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

// Roles that can be assigned via the API. 'owner' is intentionally excluded —
// ownership only changes through the dedicated transfer endpoint, never a
// plain role update, so a member can't escalate themselves to owner.
export const ASSIGNABLE_ROLES = ['editor', 'viewer'] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export class InviteMemberDto {
  @IsUUID('4')
  userId!: string;

  @IsOptional()
  @IsIn(ASSIGNABLE_ROLES)
  role?: AssignableRole;
}

export class UpdateMemberRoleDto {
  @IsUUID('4')
  userId!: string;

  @IsIn(ASSIGNABLE_ROLES)
  role!: AssignableRole;
}

export class RemoveMemberDto {
  @IsUUID('4')
  userId!: string;
}

export class TransferOwnershipDto {
  @IsUUID('4')
  userId!: string;
}

export class CreateCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  message!: string;

  // User ids referenced via the @-picker in the client. Server ignores any id
  // that isn't a member of the task, so this can't be used to spam non-members.
  @IsOptional()
  @IsUUID('4', { each: true })
  mentionedUserIds?: string[];
}

export class UpdateCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  message!: string;

  @IsOptional()
  @IsUUID('4', { each: true })
  mentionedUserIds?: string[];
}

export class PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  pageSize?: number;
}

export class PersonalPreferencesDto {
  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;

  @IsOptional()
  @IsBoolean()
  isFavorite?: boolean;

  @IsOptional()
  @IsBoolean()
  isFocusQueued?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  personalReminderMinutesBefore?: number;

  @IsOptional()
  @IsBoolean()
  notificationsMuted?: boolean;
}

export class TaskReminderDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  // Absolute fire time. Either this or `reminderBeforeMinutes` (relative to the
  // task due date) should be supplied.
  @IsOptional()
  @IsISO8601()
  triggerDateTime?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  reminderBeforeMinutes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
