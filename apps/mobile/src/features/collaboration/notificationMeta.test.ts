import assert from 'node:assert/strict';
import test from 'node:test';
import { notificationMeta, NOTIFICATION_META } from './notificationMeta.ts';

test('covers every backend notification type with category, priority, and icon metadata', () => {
  assert.equal(Object.keys(NOTIFICATION_META).length, 39);
  assert.equal(notificationMeta('mention').category, 'collaboration');
  assert.equal(notificationMeta('calendar_conflict').priority, 'high');
  assert.equal(notificationMeta('focus_reminder').icon, 'focus');
});
