import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

export class CreateRecurringCommitmentDto {
  @IsString()
  @MaxLength(255)
  title!: string;

  @IsArray()
  @ArrayMaxSize(7)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  daysOfWeek!: number[]; // 0 = Sunday .. 6 = Saturday

  @Matches(HHMM, { message: 'startTime must be HH:mm (24h).' })
  startTime!: string;

  @Matches(HHMM, { message: 'endTime must be HH:mm (24h).' })
  endTime!: string;

  @IsOptional()
  @IsString()
  savedLocationId?: string | null;

  @IsOptional()
  @IsBoolean()
  repeatWeekly?: boolean;

  @IsOptional()
  @Matches(YMD, { message: 'startDate must be YYYY-MM-DD.' })
  startDate?: string | null;

  @IsOptional()
  @Matches(YMD, { message: 'endDate must be YYYY-MM-DD.' })
  endDate?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class UpdateRecurringCommitmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  daysOfWeek?: number[];

  @IsOptional()
  @Matches(HHMM, { message: 'startTime must be HH:mm (24h).' })
  startTime?: string;

  @IsOptional()
  @Matches(HHMM, { message: 'endTime must be HH:mm (24h).' })
  endTime?: string;

  @IsOptional()
  @IsString()
  savedLocationId?: string | null;

  @IsOptional()
  @IsBoolean()
  repeatWeekly?: boolean;

  @IsOptional()
  @Matches(YMD, { message: 'startDate must be YYYY-MM-DD.' })
  startDate?: string | null;

  @IsOptional()
  @Matches(YMD, { message: 'endDate must be YYYY-MM-DD.' })
  endDate?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}
