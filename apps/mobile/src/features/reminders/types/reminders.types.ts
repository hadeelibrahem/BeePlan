export type ReminderType = 'time' | 'location' | 'context' | 'checklist';

export type ReminderStatus = 'active' | 'done' | 'missed' | 'snoozed';

export type ReminderPriority = 'low' | 'medium' | 'high' | 'urgent';

export type TriggerType = 'arrive' | 'leave';

export type RepeatFrequency = 'none' | 'daily' | 'weekly' | 'monthly';

export type ChecklistItem = {
  id: string;
  title: string;
  isDone: boolean;
};

export type TimeTriggerType = 'none' | 'general_time' | 'specific_time';

export type GeneralTimeCategory =
  | 'morning'
  | 'afternoon'
  | 'evening'
  | 'night'
  | 'weekdays'
  | 'weekends'
  | 'custom';

export type SpecificTimeRepeat = RepeatFrequency | 'custom';

export type ReminderTimeTrigger = {
  type: TimeTriggerType;
  generalTime?: {
    category: GeneralTimeCategory;
    customLabel?: string;
  };
  specificTime?: {
    date: string;
    time: string;
    repeat: SpecificTimeRepeat;
  };
};

export type LocationTriggerType = 'none' | 'general_location' | 'specific_location';

export type GeneralLocationCategory =
  | 'home'
  | 'work'
  | 'university'
  | 'school'
  | 'gym'
  | 'pharmacy'
  | 'grocery_store'
  | 'coffee_shop'
  | 'restaurant'
  | 'hospital'
  | 'airport'
  | 'bank'
  | 'atm'
  | 'parking'
  | 'gas_station'
  | 'mosque'
  | 'library'
  | 'custom';

export type GeoapifyPlaceSelection = {
  placeName: string;
  address: string;
  city?: string;
  latitude: number;
  longitude: number;
  geoapifyPlaceId?: string;
};

export type LocationSelectionSource = 'search' | 'map' | 'current_location';

export type ReminderLocationTrigger = {
  type: LocationTriggerType;
  generalLocation?: {
    category: GeneralLocationCategory;
    customLabel?: string;
  };
  specificLocation?: GeoapifyPlaceSelection & {
    selectedBy: LocationSelectionSource;
    trigger: TriggerType;
    radius: number;
  };
  /** An unresolved place name (e.g. from AI parsing) to seed the search field with — never used as a saved selection. */
  pendingPlaceName?: string;
};

export type ChecklistReminderTrigger = {
  time: ReminderTimeTrigger;
  location: ReminderLocationTrigger;
};

export type LocationReminderMode = 'specific_place' | 'general_category';

export type LocationReminderConfig = {
  mode: LocationReminderMode;
  specificPlace?: GeoapifyPlaceSelection & { selectedBy: LocationSelectionSource };
  generalCategory?: {
    category: GeneralLocationCategory;
    customLabel?: string;
  };
  trigger: TriggerType;
  radiusMeters: number;
  /** An unresolved place name (e.g. from AI parsing) to seed the search field with — never used as a saved selection. */
  pendingPlaceName?: string;
};

export type RepeatRule = {
  frequency: RepeatFrequency;
  interval: number;
  daysOfWeek?: string[];
  endDate?: string;
};

export type Reminder = {
  id: string;
  title: string;
  description?: string;
  type: ReminderType;
  status: ReminderStatus;
  priority: ReminderPriority;
  remindAt?: string;
  reminderBeforeMinutes?: number;
  repeatRule?: RepeatRule;
  location?: LocationReminderConfig;
  context?: {
    condition: string;
    detail?: string;
  };
  checklistItems?: ChecklistItem[];
  checklistReminderTrigger?: ChecklistReminderTrigger;
  createdAt: string;
  updatedAt: string;
};

export type ReminderFormValues = Omit<Reminder, 'id' | 'createdAt' | 'updatedAt' | 'status'>;
