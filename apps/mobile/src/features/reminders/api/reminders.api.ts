import type { Reminder, ReminderFormValues } from '../types/reminders.types';

const rawApiUrl = process.env.EXPO_PUBLIC_API_URL;
const apiUrl = rawApiUrl ?? 'http://localhost:3000';

if (!rawApiUrl) {
  console.warn(
    '[reminders.api] EXPO_PUBLIC_API_URL is not set in the running bundle — falling back to http://localhost:3000, ' +
      'which is NOT reachable from a physical device or most emulators. Set EXPO_PUBLIC_API_URL in apps/mobile/.env ' +
      'and restart Metro with "npx expo start -c" (env vars are inlined at bundle time, so a plain reload will not pick up changes).',
  );
} else if (/localhost|127\.0\.0\.1/.test(rawApiUrl)) {
  console.warn(
    `[reminders.api] EXPO_PUBLIC_API_URL is set to "${rawApiUrl}". "localhost"/"127.0.0.1" refers to the device ` +
      'itself, not your development machine — a physical phone (and most emulators) cannot reach your computer this way. ' +
      'Use your computer\'s LAN IP (e.g. http://192.168.x.x:3000) if testing against a local backend, or a publicly ' +
      'reachable URL (like the deployed Railway URL) otherwise. The phone and the LAN-IP backend must be on the same network.',
  );
}

console.log('[reminders.api] resolved API base URL:', apiUrl);

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
  createdAt: string;
  updatedAt: string;
};

async function apiRequest(path: string, init?: RequestInit) {
  const url = `${apiUrl}${path}`;
  const method = init?.method ?? 'GET';
  const headers = {
    'Content-Type': 'application/json',
    ...init?.headers,
  };

  console.log('[reminders.api] request:', {
    url,
    method,
    headers,
    body: init?.body,
  });

  let response: Response;
  try {
    response = await fetch(url, { ...init, headers });
  } catch (error) {
    console.error('[reminders.api] network error — request never reached the server:', {
      url,
      method,
      error,
    });
    throw new Error(
      `Could not reach the server at ${apiUrl}. Check that the backend is running and reachable from this device, ` +
        'and that EXPO_PUBLIC_API_URL is correct.',
    );
  }

  const data = await response.json().catch(() => null);

  console.log('[reminders.api] response:', {
    url,
    status: response.status,
    body: data,
  });

  if (!response.ok) {
    const message = Array.isArray(data?.message) ? data.message.join(', ') : data?.message;
    throw new Error(message ?? `Request failed with status ${response.status}.`);
  }

  return data;
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
    checklistItems: data.checklistItems?.map((item, index) => ({
      id: item.id ?? `item-${index}`,
      title: item.title,
      isDone: item.isDone ?? false,
    })),
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

export async function getReminders(): Promise<Reminder[]> {
  const data = (await apiRequest('/reminders')) as ReminderResponse[];
  return data.map(fromResponse);
}

export async function fetchReminders() {
  return getReminders();
}

export async function getReminderById(id: string): Promise<Reminder | null> {
  try {
    const data = (await apiRequest(`/reminders/${id}`)) as ReminderResponse;
    return fromResponse(data);
  } catch {
    return null;
  }
}

export async function createReminder(values: ReminderFormValues): Promise<Reminder> {
  const data = (await apiRequest('/reminders', {
    method: 'POST',
    body: JSON.stringify(toRequestBody(values)),
  })) as ReminderResponse;

  return fromResponse(data);
}

export async function updateReminder(id: string, values: ReminderFormValues): Promise<Reminder | null> {
  const data = (await apiRequest(`/reminders/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(toRequestBody(values)),
  })) as ReminderResponse;

  return fromResponse(data);
}

export async function deleteReminder(id: string): Promise<void> {
  await apiRequest(`/reminders/${id}`, { method: 'DELETE' });
}

export async function toggleReminderStatus(id: string): Promise<Reminder | null> {
  const current = await getReminderById(id);
  if (!current) return null;

  const data = (await apiRequest(`/reminders/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: current.status === 'done' ? 'active' : 'done' }),
  })) as ReminderResponse;

  return fromResponse(data);
}
