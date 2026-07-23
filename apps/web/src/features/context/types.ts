// Client mirror of the API's Personal Context shapes
// (apps/api/src/context/entities/personal-context.types.ts).

export type SavedPlace = {
  id: string
  name: string
  icon: string | null
  address: string | null
  category: string | null
  latitude: number
  longitude: number
  radiusMeters: number
  aliases: string[]
  createdAt: string
  updatedAt: string
}

export type SavedPlaceInput = {
  name: string
  icon?: string | null
  address?: string | null
  category?: string | null
  latitude: number
  longitude: number
  radiusMeters?: number
  aliases?: string[]
}

export type RecurringCommitment = {
  id: string
  title: string
  daysOfWeek: number[] // 0 = Sunday .. 6 = Saturday
  startTime: string // HH:mm
  endTime: string // HH:mm
  savedLocationId: string | null
  savedLocationName: string | null
  repeatWeekly: boolean
  startDate: string | null
  endDate: string | null
  isActive: boolean
  notes: string | null
  createdAt: string
  updatedAt: string
}

export type RecurringCommitmentInput = {
  title: string
  daysOfWeek: number[]
  startTime: string
  endTime: string
  savedLocationId?: string | null
  repeatWeekly?: boolean
  startDate?: string | null
  endDate?: string | null
  isActive?: boolean
  notes?: string | null
}
