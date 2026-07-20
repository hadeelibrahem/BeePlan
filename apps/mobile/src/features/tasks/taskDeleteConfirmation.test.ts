import assert from 'node:assert/strict';
import test from 'node:test';
import { createTaskDeleteConfirmationController, type DeleteAlertButton } from './taskDeleteConfirmation.ts';

type AlertCall = { title: string; message?: string; buttons?: DeleteAlertButton[] };

function createAlertRecorder() {
  const calls: AlertCall[] = [];
  return {
    calls,
    showAlert(title: string, message?: string, buttons?: DeleteAlertButton[]) {
      calls.push({ title, message, buttons });
    },
  };
}

test('canceling leaves the task untouched', () => {
  let deleteCalls = 0;
  const alerts = createAlertRecorder();
  const controller = createTaskDeleteConfirmationController(() => {
    deleteCalls += 1;
  }, alerts.showAlert);

  controller.requestConfirmation('Plan launch');
  alerts.calls[0].buttons?.[0].onPress?.();

  assert.equal(deleteCalls, 0);
  assert.equal(alerts.calls[0].message?.includes('Plan launch'), true);
});

test('confirming deletes the task once', async () => {
  let deleteCalls = 0;
  const alerts = createAlertRecorder();
  const controller = createTaskDeleteConfirmationController(async () => {
    deleteCalls += 1;
  }, alerts.showAlert);

  controller.requestConfirmation('Plan launch');
  alerts.calls[0].buttons?.[1].onPress?.();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(deleteCalls, 1);
});

test('repeated confirmation while deleting shares one request', async () => {
  let resolveDelete: (() => void) | undefined;
  let deleteCalls = 0;
  const alerts = createAlertRecorder();
  const controller = createTaskDeleteConfirmationController(() => {
    deleteCalls += 1;
    return new Promise<void>((resolve) => {
      resolveDelete = resolve;
    });
  }, alerts.showAlert);

  const first = controller.confirm();
  const second = controller.confirm();

  assert.equal(first, second);
  await Promise.resolve();
  assert.equal(deleteCalls, 1);
  resolveDelete?.();
  await first;
});

test('a deletion failure shows an error and can be retried', async () => {
  let attempts = 0;
  const alerts = createAlertRecorder();
  const controller = createTaskDeleteConfirmationController(async () => {
    attempts += 1;
    throw new Error('Network unavailable');
  }, alerts.showAlert);

  await controller.confirm();

  assert.equal(alerts.calls[0].title, 'Failed to delete task');
  assert.equal(alerts.calls[0].message, 'Network unavailable');
  alerts.calls[0].buttons?.[1].onPress?.();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(attempts, 2);
});
