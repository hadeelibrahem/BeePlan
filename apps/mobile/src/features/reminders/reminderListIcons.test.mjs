import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const source = readFileSync(resolve(import.meta.dirname, 'screens/RemindersListScreen.tsx'), 'utf8')
test('reminder list controls use MobileIcon instead of legacy glyph controls', () => {
  assert.match(source, /MobileIcon/)
  assert.match(source, /name="people"/)
  assert.doesNotMatch(source, /ðŸ|â†|â€º/)
})
