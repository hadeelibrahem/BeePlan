import type { Reminder, ReminderFormValues } from '../types/reminders.types';
import { API_BASE_URL, apiFetch, readJsonOrThrow } from '../../../lib/apiClient';

type ReminderResponse = {
  id: string;
  title: string;
  type: Reminder['type'];
  triggerDateTime?: string;
  reminderBefore?: number;
  repeat: 'none' | 'daily' | 'weekly' | 'monthly';
  repeatInterval?: number;
  repeatDaysOfWeek?: string[];
  repeatEndDate?: string;
  notes?: string;
  priority: Reminder['priority'];
  status: Reminder['status'];
  location?: Reminder['location'];
  context?: { condition: string; detail?: string };
  checklistItems?: { id?: string; title: string; isDone?: boolean }[];
  items?: { id?: string; title: string; isDone?: boolean }[];
  reminderTrigger?: Reminder['checklistReminderTrigger'];
  createdAt: string;
  updatedAt: string;
};

async function apiRequest<T>(path: string, accessToken: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...init?.headers,
    },
  });

  return readJsonOrThrow<T>(response, `${API_BASE_URL}${path}`);
}

function toLocationPayload(location: ReminderFormValues['location']) {
  if (!location) return undefined;

  const latitude = location.latitude !== undefined ? Number(location.latitude) : undefined;
  const longitude = location.longitude !== undefined ? Number(location.longitude) : undefined;
  const hasValidCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude);

  if (location.mode === 'specific' && (!location.placeName?.trim() || !hasValidCoordinates)) {
    throw new Error('Please select a place from the suggestions.');
  }

  const payload: Record<string, unknown> = {
    mode: location.mode,
    radiusMeters: location.radiusMeters,
    triggerType: location.triggerType,
  };

  if (location.mode === 'specific') {
    payload.placeName = location.placeName;
    if (location.address !== undefined) payload.address = location.address;
    payload.latitude = latitude;
    payload.longitude = longitude;
  }

  if (location.mode === 'category' && location.category !== undefined) {
    payload.category = location.category;
  }

  console.log('[reminders.api] submitting reminder location payload:', payload);

  return payload;
}

function toChecklistRequestBody(values: ReminderFormValues) {
  const timeTrigger = values.checklistReminderTrigger?.time;
  const timeType = timeTrigger?.type ?? 'none';

  const locationTrigger = values.checklistReminderTrigger?.location;
  const locationType = locationTrigger?.type ?? 'none';

  return {
    title: values.title,
    type: 'checklist',
    items: values.checklistItems?.filter((item) => item.title.trim()),
    notes: values.description || undefined,
    reminderTrigger: {
      time: {
        type: timeType,
        generalTime: timeType === 'general_time' ? timeTrigger?.generalTime : undefined,
        specificTime:
          timeType === 'specific_time'
            ? {
                date: timeTrigger?.specificTime?.date ?? '',
                time: timeTrigger?.specificTime?.time ?? '',
                repeat: timeTrigger?.specificTime?.repeat ?? 'none',
              }
            : undefined,
      },
      location: {
        type: locationType,
        generalLocation: locationType === 'general_location' ? locationTrigger?.generalLocation : undefined,
        specificLocation:
          locationType === 'specific_location' && locationTrigger?.specificLocation
            ? { ...locationTrigger.specificLocation }
            : undefined,
      },
    },
  };
}

function toRequestBody(values: ReminderFormValues) {
  return {
    title: values.title,
    type: values.type,
    triggerDateTime: values.remindAt || undefined,
    reminderBefore: values.reminderBeforeMinutes,
    repeat: values.repeatRule?.frequency ?? 'none',
    repeatInterval: values.repeatRule?.interval,
    repeatDaysOfWeek: values.repeatRule?.daysOfWeek,
    repeatEndDate: values.repeatRule?.endDate,
    notes: values.description || undefined,
    priority: values.priority,
    location: values.type === 'location' ? toLocationPayload(values.location) : undefined,
    context: values.context?.condition ? values.context : undefined,
    checklistItems: values.checklistItems?.filter((item) => item.title.trim()),
  };
}

function fromResponse(data: ReminderResponse): Reminder {
  return {
    id: data.id,
    title: data.title,
    description: data.notes,
    type: data.type,
    status: data.status,
    priority: data.priority,
    remindAt: data.triggerDateTime,
    reminderBeforeMinutes: data.reminderBefore,
    repeatRule: {
      frequency: data.repeat,
      interval: data.repeatInterval ?? 1,
      daysOfWeek: data.repeatDaysOfWeek,
      endDate: data.repeatEndDate,
    },
    location: data.location,
    context: data.context,
    checklistItems: (data.checklistItems ?? data.items)?.map((item, index) => ({
      id: item.id ?? `item-${index}`,
      title: item.title,
      isDone: item.isDone ?? false,
    })),
    checklistReminderTrigger: data.reminderTrigger,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

export async function getReminders(accessToken: string): Promise<Reminder[]> {
  const data = (await apiRequest('/reminders', accessToken)) as ReminderResponse[];
  return data.map(fromResponse);
}

export async function fetchReminders(accessToken: string) {
  return getReminders(accessToken);
}

export async function getReminderById(id: string, accessToken: string): Promise<Reminder | null> {
  try {
    const data = (await apiRequest(`/reminders/${id}`, accessToken)) as ReminderResponse;
    return fromResponse(data);
  } catch {
    return null;
  }
}

export async function createReminder(values: ReminderFormValues, accessToken: string): Promise<Reminder> {
  const body = values.type === 'checklist' ? toChecklistRequestBody(values) : toRequestBody(values);
  const data = (await apiRequest('/reminders', accessToken, {
    method: 'POST',
    body: JSON.stringify(body),
  })) as ReminderResponse;

  return fromResponse(data);
}

export async function updateReminder(id: string, values: ReminderFormValues, accessToken: string): Promise<Reminder | null> {
  const body = values.type === 'checklist' ? toChecklistRequestBody(values) : toRequestBody(values);
  const data = (await apiRequest(`/reminders/${id}`, accessToken, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })) as ReminderResponse;

  return fromResponse(data);
}

export async function deleteReminder(id: string, accessToken: string): Promise<void> {
  await apiRequest(`/reminders/${id}`, accessToken, { method: 'DELETE' });
}

export async function toggleReminderStatus(id: string, accessToken: string): Promise<Reminder | null> {
  const current = await getReminderById(id, accessToken);
  if (!current) return null;

  const data = (await apiRequest(`/reminders/${id}`, accessToken, {
    method: 'PATCH',
    body: JSON.stringify({ status: current.status === 'done' ? 'active' : 'done' }),
  })) as ReminderResponse;

  return fromResponse(data);
}
