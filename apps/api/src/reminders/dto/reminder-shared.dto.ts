import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';

export const REMINDER_TYPES = [
  'time',
  'location',
  'context',
  'checklist',
  // Proximity ("person nearby") reminders. Created via the social module
  // (POST /person-reminders), not the generic reminders endpoint, but listed
  // alongside other reminders — see src/social/person-reminders.service.ts.
  'person',
] as const;
export type ReminderType = (typeof REMINDER_TYPES)[number];

export const REMINDER_REPEATS = ['none', 'daily', 'weekly', 'monthly'] as const;
export type ReminderRepeat = (typeof REMINDER_REPEATS)[number];

export const REMINDER_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type ReminderPriority = (typeof REMINDER_PRIORITIES)[number];

export const REMINDER_TRIGGER_TYPES = ['arrive', 'leave'] as const;
export type ReminderTriggerType = (typeof REMINDER_TRIGGER_TYPES)[number];

export const REMINDER_STATUSES = [
  'active',
  'done',
  'missed',
  'snoozed',
] as const;
export type ReminderStatus = (typeof REMINDER_STATUSES)[number];

export const REMINDER_LOCATION_MODES = ['specific', 'category'] as const;
export type ReminderLocationMode = (typeof REMINDER_LOCATION_MODES)[number];

// Mirrors GeneralLocationCategory in the web/mobile clients (features/reminders/types/reminders.types.ts).
export const REMINDER_PLACE_CATEGORIES = [
  'home',
  'work',
  'university',
  'school',
  'gym',
  'pharmacy',
  'grocery_store',
  'coffee_shop',
  'restaurant',
  'hospital',
  'airport',
  'bank',
  'atm',
  'parking',
  'gas_station',
  'mosque',
  'library',
  'custom',
] as const;
export type ReminderPlaceCategory = (typeof REMINDER_PLACE_CATEGORIES)[number];

export class ReminderLocationDto {
  @IsIn(REMINDER_LOCATION_MODES)
  mode!: ReminderLocationMode;

  @ValidateIf((dto: ReminderLocationDto) => dto.mode === 'specific')
  @IsString()
  placeName?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @ValidateIf((dto: ReminderLocationDto) => dto.mode === 'specific')
  @IsNumber()
  latitude?: number;

  @ValidateIf((dto: ReminderLocationDto) => dto.mode === 'specific')
  @IsNumber()
  longitude?: number;

  @ValidateIf((dto: ReminderLocationDto) => dto.mode === 'category')
  @IsIn(REMINDER_PLACE_CATEGORIES)
  category?: ReminderPlaceCategory;

  @IsNumber()
  @Min(1)
  radiusMeters!: number;

  @IsIn(REMINDER_TRIGGER_TYPES)
  triggerType!: ReminderTriggerType;
}

export class ReminderContextDto {
  @IsString()
  condition!: string;

  @IsOptional()
  @IsString()
  detail?: string;
}

export class ReminderChecklistItemDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  title!: string;

  @IsOptional()
  @IsBoolean()
  isDone?: boolean;
}

/**
 * Editable subset of a person reminder's config. Person reminders are *created*
 * via POST /person-reminders (which also provisions the sharing permission);
 * this DTO only carries the fields the generic PATCH /reminders/:id may edit
 * (title/notes handled separately). Target friend changes are intentionally not
 * supported here — they would require a new sharing permission.
 */
export class ReminderPersonDto {
  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  radiusMeters?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  cooldownMinutes?: number;
}
