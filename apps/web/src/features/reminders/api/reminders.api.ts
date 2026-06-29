import type { Reminder, ReminderFormValues } from '../types/reminders.types'

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

type ReminderResponse = {
  id: string
  title: string
  type: Reminder['type']
  triggerDateTime?: string
  reminderBefore?: number
  repeat: 'none' | 'daily' | 'weekly' | 'monthly'
  repeatInterval?: number
  repeatDaysOfWeek?: string[]
  repeatEndDate?: string
  notes?: string
  priority: Reminder['priority']
  status: Reminder['status']
  location?: Reminder['location']
  context?: { condition: string; detail?: string }
  checklistItems?: { id?: string; title: string; isDone?: boolean }[]
  createdAt: string
  updatedAt: string
}

async function apiRequest(path: string, init?: RequestInit) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
  const data = await response.json().catch(() => null)

  if (!response.ok) {
    const message = Array.isArray(data?.message) ? data.message.join(', ') : data?.message
    throw new Error(message ?? 'Something went wrong. Please try again.')
  }

  return data
}

function toLocationPayload(location: ReminderFormValues['location']) {
  if (!location) return undefined

  const latitude = location.latitude !== undefined ? Number(location.latitude) : undefined
  const longitude = location.longitude !== undefined ? Number(location.longitude) : undefined

  const payload = {
    ...location,
    latitude: Number.isFinite(latitude) ? latitude : undefined,
    longitude: Number.isFinite(longitude) ? longitude : undefined,
  }

  console.log('Submitting reminder location:', {
    placeName: payload.placeName,
    address: payload.address,
    latitude: payload.latitude,
    longitude: payload.longitude,
  })

  return payload
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
  }
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
  }
}

export async function getReminders(): Promise<Reminder[]> {
  const data = (await apiRequest('/reminders')) as ReminderResponse[]
  return data.map(fromResponse)
}

export async function fetchReminders() {
  return getReminders()
}

export async function createReminder(values: ReminderFormValues): Promise<Reminder> {
  const data = (await apiRequest('/reminders', {
    method: 'POST',
    body: JSON.stringify(toRequestBody(values)),
  })) as ReminderResponse

  return fromResponse(data)
}

export async function getReminder(id: string): Promise<Reminder> {
  const data = (await apiRequest(`/reminders/${id}`)) as ReminderResponse
  return fromResponse(data)
}

export async function updateReminder(id: string, values: ReminderFormValues): Promise<Reminder | null> {
  const data = (await apiRequest(`/reminders/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(toRequestBody(values)),
  })) as ReminderResponse

  return fromResponse(data)
}

export async function deleteReminder(id: string): Promise<void> {
  await apiRequest(`/reminders/${id}`, { method: 'DELETE' })
}

export async function toggleReminderStatus(id: string): Promise<Reminder | null> {
  const current = await getReminder(id)
  const data = (await apiRequest(`/reminders/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: current.status === 'done' ? 'active' : 'done' }),
  })) as ReminderResponse

  return fromResponse(data)
}
