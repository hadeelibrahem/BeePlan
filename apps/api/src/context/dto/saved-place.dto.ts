import {
  ArrayMaxSize,
  IsArray,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  IsInt,
  IsNumber,
} from 'class-validator';

export const MAX_ALIASES_PER_PLACE = 20;

export class CreateSavedPlaceDto {
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  icon?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  // Free-form smart place category (home/work/university/gym/...). Kept as a
  // string rather than an enum so the client and the AI can extend categories
  // without an API change.
  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @IsNumber()
  @IsLatitude()
  latitude!: number;

  @IsNumber()
  @IsLongitude()
  longitude!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  radiusMeters?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_ALIASES_PER_PLACE)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  aliases?: string[];
}

// All fields optional on update; aliases (when provided) replace the full set.
export class UpdateSavedPlaceDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  icon?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @IsOptional()
  @IsNumber()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  @IsLongitude()
  longitude?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  radiusMeters?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_ALIASES_PER_PLACE)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  aliases?: string[];
}
