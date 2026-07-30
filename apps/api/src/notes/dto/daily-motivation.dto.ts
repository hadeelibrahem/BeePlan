import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class DailyMotivationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  timezone?: string;

  @IsOptional()
  @IsIn(['en', 'ar'])
  language?: 'en' | 'ar';
}
