import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { linking } from './linking.ts'

const appSource = readFileSync(resolve(import.meta.dirname, '../../App.tsx'), 'utf8')
const rootSource = readFileSync(resolve(import.meta.dirname, 'RootNavigator.tsx'), 'utf8')
const typesSource = readFileSync(resolve(import.meta.dirname, 'types.ts'), 'utf8')
const settingsSource = readFileSync(resolve(import.meta.dirname, '../screens/SettingsScreen.tsx'), 'utf8')
const moreMenuSource = readFileSync(resolve(import.meta.dirname, '../components/layout/BottomNavBar.tsx'), 'utf8')
const englishLocale = readFileSync(resolve(import.meta.dirname, '../i18n/locales/en.json'), 'utf8')
const arabicLocale = readFileSync(resolve(import.meta.dirname, '../i18n/locales/ar.json'), 'utf8')
const screenSource = readFileSync(resolve(import.meta.dirname, '../features/timeCapsules/TimeCapsulesScreen.tsx'), 'utf8')

test('Time Capsule remains a registered mobile root-stack destination', () => {
  assert.match(appSource, /import \{ TimeCapsulesScreen \} from '\.\/src\/features\/timeCapsules\/TimeCapsulesScreen'/)
  assert.match(appSource, /timeCapsulesRoute=\{TimeCapsulesScreen\}/)
  assert.match(rootSource, /<Stack\.Screen name="TimeCapsules" component=\{TimeCapsulesRoute\}/)
})

test('Settings remains the pre-merge visible entry point for Time Capsule', () => {
  assert.match(appSource, /onOpenTimeCapsules=\{\(\) => props\.navigation\.navigate\('TimeCapsules'\)\}/)
  assert.match(settingsSource, /Time Capsule/)
  assert.match(settingsSource, /onPress=\{onOpenTimeCapsules\}/)
})

test('More menu exposes Time Capsule through the existing root route', () => {
  assert.match(moreMenuSource, /route: 'TimeCapsules', icon: 'planner'/)
  assert.match(moreMenuSource, /parent\.navigate\(route\)/)
  assert.match(moreMenuSource, /navigation\.timeCapsule/)
  assert.match(englishLocale, /"timeCapsule": "Time Capsule"/)
  assert.match(arabicLocale, /"timeCapsule": "\\u0643\\u0628\\u0633\\u0648\\u0644\\u0629 \\u0632\\u0645\\u0646\\u064a\\u0629"/)
})

test('Time Capsule has a complete screen import path and route type', () => {
  assert.equal(linking.config?.screens?.TimeCapsules, undefined)
  assert.match(typesSource, /TimeCapsules: undefined/)
  assert.match(screenSource, /export function TimeCapsulesScreen/)
  assert.match(screenSource, /UnlockedAttachment/)
})
