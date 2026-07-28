import { describe, expect, it } from 'vitest'
import type { ReminderDraft } from '../types/aiAssistant.types'
import { mapDraftToReminder } from './aiDraftMapping'

const draft: ReminderDraft = {
  title: 'Pick up keys',
  description: '',
  reminderType: 'location',
  priority: 'medium',
  time: { date: '', time: '', repeat: 'none' },
  location: {
    mode: 'specific',
    name: 'Home',
    address: 'Saved address',
    category: 'home',
    trigger: 'arrive',
    radius: 175,
    latitude: 31.91,
    longitude: 35.2,
    savedPlaceId: '11111111-1111-1111-1111-111111111111',
  },
  context: { condition: '' },
  checklist: [],
}

describe('saved-place AI draft mapping', () => {
  it('reuses saved coordinates, radius, id, and trigger without geocoding', () => {
    const reminder = mapDraftToReminder(draft)
    expect(reminder.location).toMatchObject({
      mode: 'specific_place',
      trigger: 'arrive',
      radiusMeters: 175,
      specificPlace: {
        placeName: 'Home',
        latitude: 31.91,
        longitude: 35.2,
        savedPlaceId: '11111111-1111-1111-1111-111111111111',
      },
    })
    expect(reminder.location?.pendingPlaceName).toBeUndefined()
  })
})
