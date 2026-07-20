import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '../..')
const reminderCard = readFileSync(resolve(root, 'features/reminders/components/ReminderCard.tsx'), 'utf8')
const notifications = readFileSync(resolve(root, 'features/collaboration/screens/NotificationsScreen.tsx'), 'utf8')

test('reminder cards and notification rows use MobileIcon instead of rendered glyph icons', () => {
  assert.match(reminderCard, /<MobileIcon name=\{reminderTypeIcon\(reminder\.type\)\}/)
  assert.match(notifications, /<MobileIcon name="notifications"/)
  assert.doesNotMatch(notifications, /NOTIFICATION_ICON/)
})
