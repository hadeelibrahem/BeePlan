import { getAuthHeaders } from '../../../lib/api';
import { getAuthToken } from '../../../lib/authToken';
import type { ReminderDraft, VoiceReminderDraftResponse } from '../types/aiAssistant.types';
import type { GeneralLocationCategory, Reminder, ReminderFormValues } from '../types/reminders.types';

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

// Matches ReminderLocationDto in apps/api/src/reminders/dto/reminder-shared.dto.ts — the
// flat shape the backend actually validates and stores, distinct from the richer
// mode-specific LocationReminderConfig shape the reminder form/UI works with.
type BackendLocationDto = {
  mode: 'specific' | 'category';
  placeName?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  category?: string;
  radiusMeters: number;
  triggerType: 'arrive' | 'leave';
};

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
  location?: BackendLocationDto;
  context?: { condition: string; detail?: string };
  checklistItems?: { id?: string; title: string; isDone?: boolean }[];
  items?: { id?: string; title: string; isDone?: boolean }[];
  reminderTrigger?: Reminder['checklistReminderTrigger'];
  createdAt: string;
  updatedAt: string;
};

function authHeaders() {
  const token = getAuthToken();
  return token ? getAuthHeaders(token) : {};
}

async function apiRequest(path: string, init?: RequestInit) {
  const url = `${apiUrl}${path}`;
  const method = init?.method ?? 'GET';
  const headers = {
    'Content-Type': 'application/json',
    ...authHeaders(),
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

const VALID_REPEATS = ['none', 'daily', 'weekly', 'monthly'] as const;
const VALID_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;

// The backend requires `repeat`/`priority` on every reminder type (time, location,
// checklist) and rejects anything outside these enums — including undefined/null/''. Route
// every payload builder through these so a missing selection, a UI-only label, or a form
// that simply never collects repeat/priority (location, checklist) can never reach the API
// as anything other than a valid enum value.
function normalizeRepeat(value: unknown): (typeof VALID_REPEATS)[number] {
  return (VALID_REPEATS as readonly unknown[]).includes(value) ? (value as (typeof VALID_REPEATS)[number]) : 'none';
}

function normalizePriority(value: unknown): (typeof VALID_PRIORITIES)[number] {
  return (VALID_PRIORITIES as readonly unknown[]).includes(value)
    ? (value as (typeof VALID_PRIORITIES)[number])
    : 'medium';
}

function toBackendLocation(location: ReminderFormValues['location']): BackendLocationDto {
  const radiusMeters = location?.radiusMeters ?? 100;
  const triggerType = location?.trigger ?? 'arrive';

  if (location?.mode === 'general_category') {
    return {
      mode: 'category',
      category: location.generalCategory?.category ?? 'custom',
      radiusMeters,
      triggerType,
    };
  }

  const place = location?.specificPlace;

  return {
    mode: 'specific',
    placeName: place?.placeName,
    address: place?.address,
    latitude: place?.latitude,
    longitude: place?.longitude,
    radiusMeters,
    triggerType,
  };
}

function fromBackendLocation(location?: BackendLocationDto): Reminder['location'] {
  if (!location) return undefined;

  if (location.mode === 'category') {
    return {
      mode: 'general_category',
      generalCategory: { category: (location.category ?? 'custom') as GeneralLocationCategory },
      trigger: location.triggerType,
      radiusMeters: location.radiusMeters,
    };
  }

  return {
    mode: 'specific_place',
    specificPlace: {
      placeName: location.placeName ?? '',
      address: location.address ?? '',
      latitude: location.latitude ?? 0,
      longitude: location.longitude ?? 0,
      // The backend only stores place name/address/coordinates — "how the place was
      // selected" is a UI-only concept, so re-hydrating from a saved reminder defaults to
      // 'search' (the form's isValid check just requires this to be truthy).
      selectedBy: 'search',
    },
    trigger: location.triggerType,
    radiusMeters: location.radiusMeters,
  };
}

function toLocationRequestBody(values: ReminderFormValues) {
  return {
    title: values.title,
    type: 'location',
    repeat: normalizeRepeat(values.repeatRule?.frequency),
    priority: normalizePriority(values.priority),
    notes: values.description || undefined,
    location: toBackendLocation(values.location),
  };
}

function toChecklistRequestBody(values: ReminderFormValues) {
  const timeTrigger = values.checklistReminderTrigger?.time;
  const timeType = timeTrigger?.type ?? 'none';

  const locationTrigger = values.checklistReminderTrigger?.location;
  const locationType = locationTrigger?.type ?? 'none';

  return {
    title: values.title,
    type: 'checklist',
    repeat: normalizeRepeat(values.repeatRule?.frequency),
    priority: normalizePriority(values.priority),
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
    repeat: normalizeRepeat(values.repeatRule?.frequency),
    repeatInterval: values.repeatRule?.interval,
    repeatDaysOfWeek: values.repeatRule?.daysOfWeek,
    repeatEndDate: values.repeatRule?.endDate,
    notes: values.description || undefined,
    priority: normalizePriority(values.priority),
    context: values.context?.condition ? values.context : undefined,
    checklistItems: values.checklistItems?.filter((item) => item.title.trim()),
  };
}

function toRequestBodyFor(values: ReminderFormValues) {
  if (values.type === 'checklist') return toChecklistRequestBody(values);
  if (values.type === 'location') return toLocationRequestBody(values);
  return toRequestBody(values);
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
    location: fromBackendLocation(data.location),
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
  const body = toRequestBodyFor(values);
  console.log('[reminders.api] final request body for createReminder:', body);
  const data = (await apiRequest('/reminders', {
    method: 'POST',
    body: JSON.stringify(body),
  })) as ReminderResponse;

  return fromResponse(data);
}

export async function updateReminder(id: string, values: ReminderFormValues): Promise<Reminder | null> {
  const body = toRequestBodyFor(values);
  console.log('[reminders.api] final request body for updateReminder:', id, body);
  const data = (await apiRequest(`/reminders/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
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

export type RecordedAudioFile = {
  uri: string;
  name: string;
  type: string;
};

async function apiFormRequest(path: string, formData: FormData) {
  const url = `${apiUrl}${path}`;

  let response: Response;
  try {
    response = await fetch(url, { method: 'POST', body: formData, headers: authHeaders() });
  } catch (error) {
    console.error('[reminders.api] network error uploading audio:', { url, error });
    throw new Error(`Could not reach the server at ${apiUrl}. Check that the backend is running and reachable from this device.`);
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message = Array.isArray(data?.message) ? data.message.join(', ') : data?.message;
    throw new Error(message ?? `Request failed with status ${response.status}.`);
  }

  return data;
}

export async function parseReminderText(text: string): Promise<ReminderDraft> {
  return apiRequest('/ai/parse-reminder', {
    method: 'POST',
    body: JSON.stringify({ text }),
  }) as Promise<ReminderDraft>;
}

export async function createVoiceReminderDraft(audio: RecordedAudioFile): Promise<VoiceReminderDraftResponse> {
  const formData = new FormData();
  // React Native's FormData accepts a { uri, name, type } file descriptor;
  // the DOM `FormData` typings don't model this, hence the cast.
  formData.append('audio', { uri: audio.uri, name: audio.name, type: audio.type } as unknown as Blob);
  return apiFormRequest('/ai/voice-reminder-draft', formData) as Promise<VoiceReminderDraftResponse>;
}
