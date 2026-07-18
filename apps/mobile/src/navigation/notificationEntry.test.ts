import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { linking } from './linking.ts'

const appSource = readFileSync(resolve(import.meta.dirname, '../../App.tsx'), 'utf8')
const rootSource = readFileSync(resolve(import.meta.dirname, 'RootNavigator.tsx'), 'utf8')
const headerSource = readFileSync(resolve(import.meta.dirname, '../components/layout/AppHeader.tsx'), 'utf8')
const notificationsSource = readFileSync(resolve(import.meta.dirname, '../features/collaboration/screens/NotificationsScreen.tsx'), 'utf8')

test('Notifications remains a typed, deep-linkable root-stack route', () => {
  assert.equal(linking.config?.screens?.Notifications, 'notifications')
  assert.match(rootSource, /<Stack\.Screen name="Notifications" component=\{NotificationsRoute\}/)
})

test('the dashboard bell opens Notifications through the root navigator', () => {
  assert.match(appSource, /onViewNotifications=\{\(\) => rootNavigation\?\.navigate\('Notifications'\)\}/)
  assert.match(headerSource, /onOpenNotifications/)
  assert.match(headerSource, /Open notifications, \$\{unreadCount\} unread/)
})

test('read and mark-all state updates the shared unread badge', () => {
  assert.match(notificationsSource, /onUnreadCountChange\?\.\(unread\)/)
  assert.match(appSource, /onUnreadCountChange=\{setUnreadNotificationCount\}/)
})
