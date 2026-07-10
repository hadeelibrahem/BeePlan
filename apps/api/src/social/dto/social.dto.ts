import {
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { SHARING_EXPIRATIONS } from '../proximity.util';
import type { SharingExpiration } from '../proximity.util';

export const LOCATION_SHARING_MODES = ['proximity', 'live_location'] as const;
export type LocationSharingMode = (typeof LOCATION_SHARING_MODES)[number];

export class SendFriendRequestDto {
  @IsEmail()
  email!: string;
}

export class RequestLocationSharingDto {
  // The friend (owner) being asked to share their location.
  @IsUUID()
  friendId!: string;

  @IsOptional()
  @IsIn(LOCATION_SHARING_MODES)
  mode?: LocationSharingMode;

  @IsIn(SHARING_EXPIRATIONS)
  expiration!: SharingExpiration;
}

export class CreatePersonReminderDto {
  @IsString()
  title!: string;

  // The matched BeePlan friend this reminder targets.
  @IsUUID()
  targetUserId!: string;

  @IsOptional()
  @IsString()
  message?: string;

  // How the sharing consent for the target should expire.
  @IsIn(SHARING_EXPIRATIONS)
  expiration!: SharingExpiration;

  // Normalized/clamped in PersonRemindersService (default 100, 20..1000).
  @IsOptional()
  @IsNumber()
  radiusMeters?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(1440)
  cooldownMinutes?: number;
}

export class UpdateLocationSnapshotDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  accuracy?: number;
}
