import assert from 'node:assert/strict';
import test from 'node:test';
import { validateProfileDraft } from './settingsApi.ts';

test('validates profile username and email before saving', () => {
  assert.equal(validateProfileDraft({ fullName: 'A', username: 'bee_user', email: 'a@b.com' }), null);
  assert.match(validateProfileDraft({ fullName: 'A', username: 'bad name', email: 'a@b.com' }) ?? '', /Username/);
  assert.match(validateProfileDraft({ fullName: 'A', username: 'bee_user', email: 'bad' }) ?? '', /email/);
});
