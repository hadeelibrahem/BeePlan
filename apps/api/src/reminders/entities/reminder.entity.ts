import {
  ReminderChecklistItemDto,
  ReminderContextDto,
  ReminderLocationDto,
} from '../dto/reminder-shared.dto';
import type {
  ReminderPriority,
  ReminderRepeat,
  ReminderStatus,
  ReminderType,
} from '../dto/reminder-shared.dto';

export class Reminder {
  id!: string;
  title!: string;
  type!: ReminderType;
  triggerDateTime?: string;
  reminderBefore?: number;
  repeat!: ReminderRepeat;
  repeatInterval?: number;
  repeatDaysOfWeek?: string[];
  repeatEndDate?: string;
  notes?: string;
  priority!: ReminderPriority;
  status!: ReminderStatus;
  location?: ReminderLocationDto;
  context?: ReminderContextDto;
  checklistItems?: ReminderChecklistItemDto[];
  // Present only for `type = 'person'` proximity reminders. Opaque config
  // stored/managed by the social module — see src/social/person-reminders.service.ts.
  person?: Record<string, unknown>;
  createdAt!: string;
  updatedAt!: string;
}
