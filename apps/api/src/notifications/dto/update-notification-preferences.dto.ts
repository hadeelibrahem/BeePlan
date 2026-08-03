import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateNotificationPreferencesDto {
  @IsOptional() @IsBoolean() taskNotifications?: boolean;
  @IsOptional() @IsBoolean() calendarNotifications?: boolean;
  @IsOptional() @IsBoolean() focusNotifications?: boolean;
  @IsOptional() @IsBoolean() collaborationNotifications?: boolean;
  @IsOptional() @IsBoolean() aiNotifications?: boolean;
  @IsOptional() @IsBoolean() emailNotifications?: boolean;
  @IsOptional() @IsBoolean() pushNotifications?: boolean;
}
