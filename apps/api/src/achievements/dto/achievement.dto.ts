import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export const ACHIEVEMENT_CATEGORIES = ['Education', 'Career', 'Skills', 'Personal', 'Learning', 'Health', 'Financial', 'Milestone', 'Other'] as const;

export class CreateAchievementDto {
  @IsString() @MinLength(1) @MaxLength(255) title!: string;
  @IsDateString() achievementDate!: string;
  @IsString() @IsIn(ACHIEVEMENT_CATEGORIES) category!: string;
  @IsOptional() @IsString() @MaxLength(10000) description?: string;
  @IsOptional() @IsString() @MaxLength(10000) reflection?: string;
  @IsOptional() @IsUUID() relatedTaskId?: string;
}

export class UpdateAchievementDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(255) title?: string;
  @IsOptional() @IsDateString() achievementDate?: string;
  @IsOptional() @IsString() @IsIn(ACHIEVEMENT_CATEGORIES) category?: string;
  @IsOptional() @IsString() @MaxLength(10000) description?: string;
  @IsOptional() @IsString() @MaxLength(10000) reflection?: string;
}
