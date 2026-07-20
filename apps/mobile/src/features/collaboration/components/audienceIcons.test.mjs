import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const dir = import.meta.dirname
const focus = readFileSync(resolve(dir, 'FocusAudienceSection.tsx'), 'utf8')
const reminder = readFileSync(resolve(dir, 'ReminderAudienceSection.tsx'), 'utf8')
test('audience controls render MobileIcon without legacy glyph icon bytes', () => {
  for (const source of [focus, reminder]) {
    assert.match(source, /MobileIcon/)
    assert.doesNotMatch(source, /ðŸ|âœ|â†/)
  }
})
