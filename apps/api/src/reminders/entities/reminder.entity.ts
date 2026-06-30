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
  createdAt!: string;
  updatedAt!: string;
}
