import { Transform, Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  IsBoolean,
  Max,
  MaxLength,
  MinLength,
  Min,
  Validate,
  ValidateNested,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
  type ValidationArguments,
} from 'class-validator';

export const MAX_WHITEBOARD_SNAPSHOT_BYTES = 4 * 1024 * 1024;
export const MIN_WHITEBOARD_ZOOM = 0.05;
export const MAX_WHITEBOARD_ZOOM = 8;

@ValidatorConstraint({ name: 'whiteboardAssetReferences', async: false })
class WhiteboardAssetReferencesConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    try {
      const serialized = JSON.stringify(value);
      if (serialized === undefined || Buffer.byteLength(serialized, 'utf8') > MAX_WHITEBOARD_SNAPSHOT_BYTES) return false;
      return Object.entries(value as Record<string, unknown>).every(([tldrawAssetId, reference]) => {
        if (!tldrawAssetId || !reference || typeof reference !== 'object' || Array.isArray(reference)) return false;
        const item = reference as Record<string, unknown>;
        return typeof item.beeplanAssetId === 'string' && item.beeplanAssetId.length > 0
          && typeof item.stableResolverUrl === 'string'
          && /^https?:\/\/[^\s]+$/.test(item.stableResolverUrl);
      });
    } catch {
      return false;
    }
  }

  defaultMessage() {
    return 'assetReferences must map tldraw asset ids to BeePlan asset ids and stable resolver URLs.';
  }
}

@ValidatorConstraint({ name: 'jsonSerializable', async: false })
class JsonSerializableConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    if (value === null) return true;

    try {
      const serialized = JSON.stringify(value);
      return (
        serialized !== undefined &&
        Buffer.byteLength(serialized, 'utf8') <= MAX_WHITEBOARD_SNAPSHOT_BYTES &&
        !serialized.includes('NaN') &&
        !serialized.includes('Infinity')
      );
    } catch {
      return false;
    }
  }

  defaultMessage(_arguments?: ValidationArguments) {
    return `snapshot must be JSON-serializable and no larger than ${MAX_WHITEBOARD_SNAPSHOT_BYTES} bytes.`;
  }
}

export class WhiteboardCameraDto {
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(-1_000_000_000)
  @Max(1_000_000_000)
  x!: number;

  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(-1_000_000_000)
  @Max(1_000_000_000)
  y!: number;

  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(MIN_WHITEBOARD_ZOOM)
  @Max(MAX_WHITEBOARD_ZOOM)
  zoom!: number;
}

export class UpdateWhiteboardDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @Validate(JsonSerializableConstraint)
  snapshot?: unknown;

  @IsOptional()
  @Validate(WhiteboardAssetReferencesConstraint)
  assetReferences?: Record<string, { beeplanAssetId: string; stableResolverUrl: string }>;

  @IsOptional()
  @ValidateNested()
  @Type(() => WhiteboardCameraDto)
  camera?: WhiteboardCameraDto;
}

export class CreateWhiteboardDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(255)
  name?: string;
}

export class UpdateWhiteboardBoardDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;

  @IsOptional()
  @Validate(JsonSerializableConstraint)
  snapshot?: unknown;

  @IsOptional()
  @Validate(WhiteboardAssetReferencesConstraint)
  assetReferences?: Record<string, { beeplanAssetId: string; stableResolverUrl: string }>;

  @IsOptional()
  @ValidateNested()
  @Type(() => WhiteboardCameraDto)
  camera?: WhiteboardCameraDto;
}
