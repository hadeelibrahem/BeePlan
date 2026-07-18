import { PersonRemindersService, evaluatePersonReminderProximity, type PersonReminderConfig } from './person-reminders.service';

const VIEWER_ID = '11111111-1111-1111-1111-111111111111';
const TARGET_ID = '22222222-2222-2222-2222-222222222222';
const REMINDER_ID = '33333333-3333-3333-3333-333333333333';

function baseConfig(overrides: Partial<PersonReminderConfig> = {}): PersonReminderConfig {
  return {
    targetUserId: TARGET_ID,
    targetName: 'Sara',
    message: 'Say hi',
    radiusMeters: 100,
    cooldownMinutes: 30,
    permissionId: 'perm-1',
    lastNotifiedAt: null,
    proximityState: 'outside',
    lastEnteredAt: null,
    lastExitedAt: null,
    lastTransitionAt: null,
    completedAt: null,
    ...overrides,
  };
}

describe('evaluatePersonReminderProximity', () => {
  const now = new Date('2026-07-18T10:00:00.000Z');

  it('does not trigger when the first observed state is already nearby', () => {
    const result = evaluatePersonReminderProximity({
      reminderId: REMINDER_ID,
      repeat: 'daily',
      config: baseConfig({ proximityState: null }),
      distanceMeters: 60,
      now,
    });

    expect(result.action).toBe('skip');
    expect(result.log).toContain('skip: already nearby');
    expect(result.updatedConfig).toMatchObject({ proximityState: 'inside' });
  });

  it('triggers exactly once on a genuine outside-to-inside transition', () => {
    const result = evaluatePersonReminderProximity({
      reminderId: REMINDER_ID,
      repeat: 'daily',
      config: baseConfig({ proximityState: 'outside' }),
      distanceMeters: 80,
      now,
    });

    expect(result.action).toBe('trigger');
    expect(result.log).toContain('trigger: entered radius');
    expect(result.updatedConfig).toMatchObject({
      proximityState: 'inside',
      lastNotifiedAt: now.toISOString(),
    });
  });

  it('skips repeated nearby checks after the reminder is already inside', () => {
    const result = evaluatePersonReminderProximity({
      reminderId: REMINDER_ID,
      repeat: 'daily',
      config: baseConfig({ proximityState: 'inside', lastEnteredAt: now.toISOString() }),
      distanceMeters: 90,
      now: new Date('2026-07-18T10:05:00.000Z'),
    });

    expect(result.action).toBe('skip');
    expect(result.log).toContain('skip: already nearby');
    expect(result.updatedConfig).toBeUndefined();
  });

  it('re-arms only after leaving the larger exit threshold', () => {
    const result = evaluatePersonReminderProximity({
      reminderId: REMINDER_ID,
      repeat: 'daily',
      config: baseConfig({ proximityState: 'inside' }),
      distanceMeters: 121,
      now,
    });

    expect(result.action).toBe('skip');
    expect(result.log).toContain('re-armed: exited radius');
    expect(result.updatedConfig).toMatchObject({
      proximityState: 'outside',
      lastExitedAt: now.toISOString(),
    });
  });

  it('triggers again for a recurring reminder after re-arming', () => {
    const result = evaluatePersonReminderProximity({
      reminderId: REMINDER_ID,
      repeat: 'weekly',
      config: baseConfig({
        proximityState: 'outside',
        lastExitedAt: '2026-07-18T09:45:00.000Z',
        lastTransitionAt: '2026-07-18T09:45:00.000Z',
      }),
      distanceMeters: 75,
      now,
    });

    expect(result.action).toBe('trigger');
    expect(result.updatedStatus).toBe('active');
  });

  it('marks a one-time reminder done after the first valid encounter', () => {
    const result = evaluatePersonReminderProximity({
      reminderId: REMINDER_ID,
      repeat: 'none',
      config: baseConfig({ proximityState: 'outside' }),
      distanceMeters: 70,
      now,
    });

    expect(result.action).toBe('trigger');
    expect(result.updatedStatus).toBe('done');
    expect(result.updatedConfig).toMatchObject({
      completedAt: now.toISOString(),
      proximityState: 'inside',
    });
  });

  it('never triggers a one-time reminder again once completed', () => {
    const result = evaluatePersonReminderProximity({
      reminderId: REMINDER_ID,
      repeat: 'none',
      config: baseConfig({
        proximityState: 'outside',
        completedAt: '2026-07-18T09:30:00.000Z',
      }),
      distanceMeters: 70,
      now,
    });

    expect(result.action).toBe('skip');
    expect(result.log).toContain('one-time reminder already completed');
    expect(result.updatedStatus).toBe('done');
  });

  it('does not re-arm because of GPS jitter near the entry boundary', () => {
    const result = evaluatePersonReminderProximity({
      reminderId: REMINDER_ID,
      repeat: 'daily',
      config: baseConfig({
        proximityState: 'inside',
        lastEnteredAt: '2026-07-18T09:55:00.000Z',
      }),
      distanceMeters: 110,
      now,
    });

    expect(result.action).toBe('skip');
    expect(result.log).toContain('skip: already nearby');
    expect(result.updatedConfig).toBeUndefined();
  });
});

describe('PersonRemindersService.checkNearby persisted state', () => {
  function createReminderRow(config: PersonReminderConfig, repeat = 'daily') {
    return {
      id: REMINDER_ID,
      userId: VIEWER_ID,
      title: 'Talk to Sara',
      type: 'person',
      repeat,
      priority: 'medium',
      status: 'active',
      notes: config.message,
      person: config,
      createdAt: new Date('2026-07-18T09:00:00.000Z'),
      updatedAt: new Date('2026-07-18T09:00:00.000Z'),
    };
  }

  function createSelectMock(reminderRows: unknown[]) {
    const queue = [
      [{ latitude: '1', longitude: '1' }],
      reminderRows,
      [{ latitude: '1', longitude: '1' }],
    ];

    return jest.fn(() => ({
      from: () => ({
        where: () => Promise.resolve(queue.shift() ?? []),
      }),
    }));
  }

  function createUpdateBuilder(sink: Array<Record<string, unknown>>) {
    const builder: Record<string, jest.Mock> = {};
    builder.set = jest.fn((value: Record<string, unknown>) => {
      sink.push(value);
      return builder;
    });
    builder.where = jest.fn().mockResolvedValue(undefined);
    return builder;
  }

  it('preserves inside state across a service restart and does not fire on startup', async () => {
    const updates: Array<Record<string, unknown>> = [];
    const db = {
      select: createSelectMock([
        createReminderRow(
          baseConfig({
            proximityState: 'inside',
            lastEnteredAt: '2026-07-18T09:30:00.000Z',
            lastTransitionAt: '2026-07-18T09:30:00.000Z',
          }),
        ),
      ]),
      update: jest.fn(() => createUpdateBuilder(updates)),
      insert: jest.fn(),
    };
    const service = new PersonRemindersService(
      { db } as never,
      { areFriends: jest.fn(), loadSummaries: jest.fn() } as never,
      { findActivePermission: jest.fn().mockResolvedValue({ id: 'perm-1' }) } as never,
    );

    const hits = await service.checkNearby(VIEWER_ID);

    expect(hits).toEqual([]);
    expect(db.update).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
  });
});
