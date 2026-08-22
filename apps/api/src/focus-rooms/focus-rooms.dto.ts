import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';

export class CreateFocusRoomDto {
  @IsString() @Length(1, 160) title!: string;
  @IsOptional() @IsString() @Length(0, 2000) description?: string;
  @IsIn(['public', 'private', 'team', 'temporary']) visibility!: string;
  @IsIn(['commitment']) mode!: string;
  @IsOptional() @IsInt() @Min(2) @Max(200) maxMembers?: number;
  @IsOptional() @IsBoolean() leaderboardEnabled?: boolean;
}
export class JoinFocusRoomDto {
  @IsOptional() @IsString() inviteCode?: string;
  @IsOptional() @IsBoolean() anonymous?: boolean;
  @IsOptional() @IsBoolean() showTaskTitle?: boolean;
  @IsOptional() @IsBoolean() showTimer?: boolean;
  @IsOptional() @IsBoolean() showStatistics?: boolean;
}
export class JoinFocusRoomByCodeDto {
  @IsString() @Length(4, 32) code!: string;
}
export class CreateCommitmentDto {
  @IsInt() @Min(1) @Max(480) durationMinutes!: number;
  @IsOptional() @IsString() @Length(1, 160) goalLabel?: string;
  @IsOptional() @IsInt() @Min(1) @Max(120) breakMinutes?: number;
  @IsOptional() @IsInt() @Min(10) @Max(600) reconnectGraceSeconds?: number;
}
export class CommitmentAcceptanceDto {
  @IsBoolean() accepted!: boolean;
}
export class ExtendCommitmentDto {
  @IsInt() @Min(1) @Max(120) minutes!: number;
}
export class TerminateCommitmentDto {
  @IsUUID() commandId!: string;
  @IsIn([
    'participant_left_early',
    'participant_disconnect_timeout',
    'participant_cancelled_focus',
    'owner_ended_session',
  ])
  reason!: string;
}
export class PresenceDto {
  @IsUUID() connectionId!: string;
}
export class PrepareCommitmentParticipantDto {
  @IsOptional() @IsUUID() taskId?: string;
  @IsOptional() @IsUUID() subtaskId?: string;
}
export class CreateRoomInviteDto {
  @IsIn(['email', 'link']) type!: 'email' | 'link';
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsInt() @Min(1) @Max(168) expiresInHours?: number;
}
export class InviteDecisionDto {
  @IsIn(['accept', 'reject']) decision!: string;
}
export class UpdateRoomGoalDto {
  @IsOptional() @IsInt() @Min(1) @Max(100000) goalTargetMinutes?: number;
}
