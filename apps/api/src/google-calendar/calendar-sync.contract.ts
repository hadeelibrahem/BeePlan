export type CalendarSyncEntityType = 'task' | 'focus_session' | 'reminder' | 'calendar_block';
export type CalendarSyncSource = 'task' | 'focus' | 'reminder' | 'calendar_block';

export type CalendarSyncCandidate = {
  entityType: CalendarSyncEntityType;
  entityId: string;
  userId: string;
  title: string;
  description?: string | null;
  startDateTime: Date | null;
  endDateTime: Date | null;
  timezone: string;
  location?: string | null;
  allDay: boolean;
  status: string;
  syncEligible: boolean;
  destinationCalendarId?: string | null;
  source: CalendarSyncSource;
  updatedAt: Date;
};

export function canExportCandidate(candidate: CalendarSyncCandidate, settingEnabled = true) {
  return settingEnabled && candidate.syncEligible && Boolean(candidate.startDateTime && candidate.endDateTime) && candidate.status !== 'deleted';
}

export function retryDelayMs(attempt: number) { return Math.min(60 * 60 * 1000, 1000 * 2 ** Math.max(1, attempt)); }
