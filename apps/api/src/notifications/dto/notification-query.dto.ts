import { Transform } from 'class-transformer';
import { IsBooleanString, IsInt, IsOptional, Max, Min } from 'class-validator';

export class NotificationQueryDto {
  // Keyset-friendly page/size pagination. Defaults keep the bell dropdown fast.
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  // When 'true', only unread notifications are returned.
  @IsOptional()
  @IsBooleanString()
  unreadOnly?: string;
}
