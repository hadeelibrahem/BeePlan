import { IsEmail, IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class CreateWhiteboardInvitationDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  username?: string;

  @IsOptional()
  @IsUUID()
  inviteeUserId?: string;

  @IsIn(['editor', 'viewer'])
  role!: 'editor' | 'viewer';
}

export class UpdateWhiteboardMemberDto {
  @IsIn(['editor', 'viewer'])
  role!: 'editor' | 'viewer';
}
