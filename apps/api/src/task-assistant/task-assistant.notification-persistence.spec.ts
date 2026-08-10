import {
  REUSABLE_CONTEXT_NOTIFICATION_STATUSES,
  upsertContextNotification,
} from './task-assistant.service';

const values = {
  userId: '00000000-0000-4000-8000-000000000001',
  taskId: '00000000-0000-4000-8000-000000000002',
  contextId: '00000000-0000-4000-8000-000000000003',
  notificationType: 'meeting_preparation',
  title: 'Check meeting link and equipment',
  body: 'Your meeting starts soon.',
  scheduledAt: new Date('2026-08-08T17:30:00.000Z'),
  priority: 'normal',
  fingerprint: 'stable-fingerprint',
};

function mockDatabase() {
  const onConflictDoUpdate = jest.fn().mockResolvedValue(undefined);
  const insertValues = jest.fn().mockReturnValue({ onConflictDoUpdate });
  const insert = jest.fn().mockReturnValue({ values: insertValues });
  return { db: { insert } as never, insert, insertValues, onConflictDoUpdate };
}

describe('Task Assistant notification fingerprint persistence', () => {
  it('uses one atomic upsert for equivalent concurrent refreshes', async () => {
    const database = mockDatabase();

    await Promise.all([
      upsertContextNotification(database.db, values),
      upsertContextNotification(database.db, values),
    ]);

    expect(database.insert).toHaveBeenCalledTimes(2);
    expect(database.insertValues).toHaveBeenNthCalledWith(1, values);
    expect(database.insertValues).toHaveBeenNthCalledWith(2, values);
    expect(database.onConflictDoUpdate).toHaveBeenCalledTimes(2);
  });

  it('reactivates reusable rows while preserving delivered and cancelled rows', async () => {
    const database = mockDatabase();

    await upsertContextNotification(database.db, values);

    const conflict = database.onConflictDoUpdate.mock.calls[0][0];
    expect(conflict.set).toMatchObject({
      status: 'pending',
      deliveredAt: null,
      retryCount: 0,
      lastErrorCode: null,
    });
    expect(conflict.setWhere).toBeDefined();
    expect(REUSABLE_CONTEXT_NOTIFICATION_STATUSES).toEqual([
      'pending',
      'scheduled',
      'failed_retryable',
      'invalidated',
    ]);
    expect(REUSABLE_CONTEXT_NOTIFICATION_STATUSES).not.toContain('delivered');
    expect(REUSABLE_CONTEXT_NOTIFICATION_STATUSES).not.toContain('cancelled');
  });
});
