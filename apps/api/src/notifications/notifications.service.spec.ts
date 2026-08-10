import { NotificationsService } from './notifications.service';

const input = {
  userId: 'user-1',
  taskId: 'task-1',
  type: 'task_assistant' as const,
  title: 'Check meeting link and equipment',
  body: 'Your meeting starts soon.',
  priority: 'high' as const,
};

const identity = {
  entityType: 'task_assistant',
  entityId: 'scheduled-row-1',
  triggerAt: new Date('2026-08-08T17:30:00.000Z'),
  key: 'stable-fingerprint',
};

function preferenceSelect() {
  const chain = {
    from: jest.fn(),
    where: jest.fn(),
    limit: jest.fn().mockResolvedValue([{ aiNotifications: true }]),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  return chain;
}

function insertReturning(row: unknown) {
  const returning = jest.fn().mockResolvedValue(row ? [row] : []);
  const onConflictDoNothing = jest.fn().mockReturnValue({ returning });
  const values = jest.fn().mockReturnValue({ onConflictDoNothing, returning });
  return { values, onConflictDoNothing, returning };
}

describe('NotificationsService.createOnce', () => {
  it('atomically creates the delivery identity, inbox row, and push job', async () => {
    const deliveryInsert = insertReturning({ id: 'delivery-1' });
    const notificationInsert = insertReturning({ id: 'notification-1' });
    const tx = {
      insert: jest.fn()
        .mockReturnValueOnce(deliveryInsert)
        .mockReturnValueOnce(notificationInsert),
    };
    const db = {
      select: jest.fn(preferenceSelect),
      transaction: jest.fn(async (callback: (executor: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const push = { enqueueForNotification: jest.fn().mockResolvedValue(undefined) };
    const service = new NotificationsService({ db } as never, push as never);

    await expect(service.createOnce(input, identity)).resolves.toMatchObject({
      inserted: 1,
      skipped: 0,
    });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(push.enqueueForNotification).toHaveBeenCalledWith(
      'notification-1',
      input,
      tx,
    );
  });

  it('treats an existing delivery identity as a completed idempotent duplicate', async () => {
    const deliveryInsert = insertReturning(null);
    const tx = { insert: jest.fn().mockReturnValue(deliveryInsert) };
    const db = {
      select: jest.fn(preferenceSelect),
      transaction: jest.fn(async (callback: (executor: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const push = { enqueueForNotification: jest.fn() };
    const service = new NotificationsService({ db } as never, push as never);

    await expect(service.createOnce(input, identity)).resolves.toEqual({
      inserted: 0,
      skipped: 1,
      reason: 'duplicate',
    });
    expect(tx.insert).toHaveBeenCalledTimes(1);
    expect(push.enqueueForNotification).not.toHaveBeenCalled();
  });

  it('propagates an inbox insert failure so the database transaction can roll back the claim', async () => {
    const deliveryInsert = insertReturning({ id: 'delivery-1' });
    const failedNotificationInsert = insertReturning(null);
    const tx = {
      insert: jest.fn()
        .mockReturnValueOnce(deliveryInsert)
        .mockReturnValueOnce(failedNotificationInsert),
    };
    const db = {
      select: jest.fn(preferenceSelect),
      transaction: jest.fn(async (callback: (executor: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const service = new NotificationsService({ db } as never, {} as never);

    await expect(service.createOnce(input, identity)).rejects.toThrow(
      'Inbox notification insert returned no row.',
    );
  });
});
