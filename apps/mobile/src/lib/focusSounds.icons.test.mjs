import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '..')
const catalog = readFileSync(resolve(root, 'lib/focusSounds.ts'), 'utf8')
const screen = readFileSync(resolve(root, 'screens/FocusSessionScreen.tsx'), 'utf8')

test('focus sound catalog uses typed MobileIcon names instead of emoji glyphs', () => {
  assert.match(catalog, /MobileIconName/)
  assert.doesNotMatch(catalog, /[\p{Extended_Pictographic}]/u)
  assert.match(screen, /<MobileIcon name=\{sound\.icon\}/)
})
