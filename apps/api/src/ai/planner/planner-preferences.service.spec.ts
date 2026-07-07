import { BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../db/database.service';
import { DEFAULT_PLANNER_PREFERENCES, PlannerPreferencesService } from './planner-preferences.service';

const USER_ID = '11111111-1111-1111-1111-111111111111';

function selectQuery(rows: unknown[]) {
  const promise = Promise.resolve(rows);
  return {
    from: () => selectQuery(rows),
    where: () => selectQuery(rows),
    limit: () => selectQuery(rows),
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally.bind(promise),
  };
}

function buildService(existingRows: unknown[] = []) {
  const onConflictDoUpdate = jest.fn().mockResolvedValue(undefined);
  const values = jest.fn(() => ({ onConflictDoUpdate }));
  const insert = jest.fn(() => ({ values }));
  const db = {
    select: jest.fn(() => selectQuery(existingRows)),
    insert,
  };
  const service = new PlannerPreferencesService({ db } as unknown as DatabaseService);
  return { service, insert, values, onConflictDoUpdate };
}

describe('PlannerPreferencesService', () => {
  describe('getPreferences', () => {
    it('returns defaults when the user has no saved preferences', async () => {
      const { service } = buildService([]);
      const prefs = await service.getPreferences(USER_ID);
      expect(prefs).toEqual(DEFAULT_PLANNER_PREFERENCES);
    });

    it('maps a stored row back into a preferences object', async () => {
      const row = {
        userId: USER_ID,
        focusStartTime: '07:30',
        focusEndTime: '10:30',
        workBlockMinutes: 45,
        breakMinutes: 15,
        energyMorning: 'high',
        energyAfternoon: 'low',
        energyEvening: 'medium',
        energyNight: 'low',
        scheduleHardTasksInFocus: false,
        finishStartedFirst: false,
        groupSimilarTasks: true,
        bufferBeforeMeetings: false,
        bufferMinutes: 20,
        note: 'I like mornings.',
      };
      const { service } = buildService([row]);
      const prefs = await service.getPreferences(USER_ID);

      expect(prefs.focusStartTime).toBe('07:30');
      expect(prefs.workBlockMinutes).toBe(45);
      expect(prefs.energy.afternoon).toBe('low');
      expect(prefs.finishStartedFirst).toBe(false);
      expect(prefs.note).toBe('I like mornings.');
    });
  });

  describe('savePreferences (persistence)', () => {
    it('upserts normalized preferences and returns them', async () => {
      const { service, insert, values, onConflictDoUpdate } = buildService();
      const result = await service.savePreferences(USER_ID, {
        focusStartTime: '09:00',
        focusEndTime: '12:00',
        workBlockMinutes: 60,
        breakMinutes: 10,
        energy: { morning: 'high', afternoon: 'medium', evening: 'low', night: 'low' },
        note: 'Deep work in the morning.',
      });

      expect(insert).toHaveBeenCalledTimes(1);
      expect(onConflictDoUpdate).toHaveBeenCalledTimes(1);
      const persisted = values.mock.calls[0][0];
      expect(persisted.userId).toBe(USER_ID);
      expect(persisted.focusStartTime).toBe('09:00');
      expect(persisted.workBlockMinutes).toBe(60);
      expect(result.note).toBe('Deep work in the morning.');
    });

    it('clamps out-of-range work block and break durations', async () => {
      const { service, values } = buildService();
      await service.savePreferences(USER_ID, { workBlockMinutes: 500, breakMinutes: 1 });
      const persisted = values.mock.calls[0][0];
      expect(persisted.workBlockMinutes).toBe(120); // clamped to max
      expect(persisted.breakMinutes).toBe(5); // clamped to min
    });

    it('rejects focus hours that are not in order', async () => {
      const { service } = buildService();
      await expect(service.savePreferences(USER_ID, { focusStartTime: '11:00', focusEndTime: '09:00' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects a note longer than 1000 characters', async () => {
      const { service } = buildService();
      await expect(service.savePreferences(USER_ID, { note: 'x'.repeat(1001) })).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
