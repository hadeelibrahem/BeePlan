import assert from 'node:assert/strict';
import test from 'node:test';
import { createUnsavedBackGuard } from './unsavedBackGuard.ts';

test('a clean form does not intercept back (lets the app navigate)', () => {
  let confirmed = 0;
  let left = 0;
  const handleBack = createUnsavedBackGuard({
    isDirty: () => false,
    confirmDiscard: () => {
      confirmed += 1;
    },
    onLeave: () => {
      left += 1;
    },
  });

  assert.equal(handleBack(), false);
  assert.equal(confirmed, 0);
  assert.equal(left, 0);
});

test('a dirty form intercepts back and prompts to discard', () => {
  let confirmCalls = 0;
  const handleBack = createUnsavedBackGuard({
    isDirty: () => true,
    confirmDiscard: () => {
      confirmCalls += 1;
    },
    onLeave: () => {},
  });

  assert.equal(handleBack(), true);
  assert.equal(confirmCalls, 1);
});

test('confirming the discard prompt leaves the form', () => {
  let left = 0;
  // Simulate the user tapping "Discard": the prompt invokes its callback.
  const handleBack = createUnsavedBackGuard({
    isDirty: () => true,
    confirmDiscard: (onDiscard) => onDiscard(),
    onLeave: () => {
      left += 1;
    },
  });

  handleBack();
  assert.equal(left, 1);
});

test('dismissing the prompt keeps the user on the form', () => {
  let left = 0;
  // Simulate "Keep editing": the prompt never invokes its callback.
  const handleBack = createUnsavedBackGuard({
    isDirty: () => true,
    confirmDiscard: () => {},
    onLeave: () => {
      left += 1;
    },
  });

  assert.equal(handleBack(), true);
  assert.equal(left, 0);
});
