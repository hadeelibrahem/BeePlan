import { readFileSync } from 'fs';
import { join } from 'path';
import { TaskAssistantService } from './task-assistant.service';

const currentRow = {
  userId: 'user',
  enabled: false,
  preparationChecklistsEnabled: true,
  travelAdviceEnabled: true,
  weatherAdviceEnabled: true,
  documentAdviceEnabled: true,
  clothingAdviceEnabled: true,
  umbrellaAdviceEnabled: true,
  hydrationAdviceEnabled: true,
  proactiveAssistanceEnabled: true,
  dynamicPreparationEnabled: true,
  dynamicPackingEnabled: true,
  contextTimelineEnabled: true,
  contextualNotificationsEnabled: true,
  electronicsAdviceEnabled: true,
  medicationAdviceEnabled: true,
  departureRemindersEnabled: true,
  notificationMode: 'minimal',
  defaultTravelMode: 'walking',
  language: 'ar',
  createdAt: new Date(),
  updatedAt: new Date(),
};

function serviceWithRows(rows: unknown[][]) {
  const next = () => Promise.resolve(rows.shift() ?? []);
  const query = () => {
    const chain: Record<string, unknown> = {};
    chain.from = () => chain;
    chain.where = () => chain;
    chain.limit = next;
    chain.then = (resolve: (value: unknown) => unknown) => next().then(resolve);
    return chain;
  };
  const insertChain = {
    values: () => insertChain,
    onConflictDoUpdate: () => Promise.resolve(),
  };
  const database = {
    db: { select: jest.fn(query), insert: jest.fn(() => insertChain) },
  };
  return {
    service: new TaskAssistantService(
      database as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    ),
    database,
  };
}

describe('Task Assistant preferences', () => {
  it('returns safe defaults for a first-time user', async () => {
    const { service } = serviceWithRows([[]]);
    await expect(service.getPreferences('new-user')).resolves.toMatchObject({
      enabled: true,
      proactiveAssistanceEnabled: true,
      notificationMode: 'smart',
    });
  });
  it('returns an existing current settings row', async () => {
    const { service } = serviceWithRows([[currentRow]]);
    await expect(service.getPreferences('user')).resolves.toMatchObject({
      enabled: false,
      notificationMode: 'minimal',
      language: 'ar',
    });
  });
  it('fills missing optional fields with safe defaults', async () => {
    const legacyShape = {
      ...currentRow,
      proactiveAssistanceEnabled: undefined,
      dynamicPackingEnabled: undefined,
    };
    const { service } = serviceWithRows([[legacyShape]]);
    await expect(service.getPreferences('user')).resolves.toMatchObject({
      proactiveAssistanceEnabled: true,
      dynamicPackingEnabled: true,
    });
  });
  it('handles duplicate development GET requests independently', async () => {
    const { service, database } = serviceWithRows([[], []]);
    await Promise.all([
      service.getPreferences('user'),
      service.getPreferences('user'),
    ]);
    expect(database.db.select).toHaveBeenCalledTimes(2);
  });
  it('updates preferences after a default load', async () => {
    const { service } = serviceWithRows([
      [],
      [],
      [{ ...currentRow, enabled: true }],
    ]);
    await service.getPreferences('user');
    await expect(
      service.updatePreferences('user', {
        enabled: true,
        notificationMode: 'minimal',
      }),
    ).resolves.toMatchObject({ enabled: true, notificationMode: 'minimal' });
  });
  it('keeps the legacy import backward-compatible and idempotent', () => {
    const sql = readFileSync(
      join(process.cwd(), 'drizzle', '0019_task_context_assistant.sql'),
      'utf8',
    );
    expect(sql).toContain('FROM "weather_travel_preferences"');
    expect(sql).toContain('ON CONFLICT ("user_id") DO NOTHING');
  });
});
