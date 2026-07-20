import { BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../db/database.service';
import { PlannerAcceptanceService } from './planner-acceptance.service';
import type { DailyPlan } from './planner.types';

const USER_ID = '11111111-1111-1111-1111-111111111111';

const SAMPLE_PLAN: DailyPlan = {
  date: '2026-07-14',
  generatedAt: '2026-07-14T08:00:00.000Z',
  source: 'ai',
  workingHours: { start: '08:00', end: '21:00' },
  summary: 'A focused day.',
  sections: { morning: [], afternoon: [], evening: [], night: [] },
  unscheduled: [],
  capacity: {
    availableMinutes: 480,
    requestedMinutes: 120,
    scheduledMinutes: 120,
    postponedMinutes: 0,
    scheduledTaskCount: 2,
    postponedTaskCount: 0,
    freeMinutes: 480,
    maxDailyWorkMinutes: 480,
    emergencyBufferMinutes: 30,
  },
};

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
  const service = new PlannerAcceptanceService({
    db,
  } as unknown as DatabaseService);
  return { service, insert, values, onConflictDoUpdate };
}

describe('PlannerAcceptanceService', () => {
  describe('getAcceptance', () => {
    it('returns null when the user has not accepted a plan for that date', async () => {
      const { service } = buildService([]);
      const result = await service.getAcceptance(USER_ID, '2026-07-14');
      expect(result).toBeNull();
    });

    it('maps a stored row back into a plan acceptance', async () => {
      const acceptedAt = new Date('2026-07-14T09:00:00.000Z');
      const row = { date: '2026-07-14', plan: SAMPLE_PLAN, acceptedAt };
      const { service } = buildService([row]);
      const result = await service.getAcceptance(USER_ID, '2026-07-14');

      expect(result).not.toBeNull();
      expect(result!.date).toBe('2026-07-14');
      expect(result!.plan).toEqual(SAMPLE_PLAN);
      expect(result!.acceptedAt).toBe(acceptedAt.toISOString());
    });
  });

  describe('acceptPlan (persistence)', () => {
    it('upserts the accepted plan keyed by user + date and returns it', async () => {
      const { service, insert, values, onConflictDoUpdate } = buildService();
      const result = await service.acceptPlan(USER_ID, { plan: SAMPLE_PLAN });

      expect(insert).toHaveBeenCalledTimes(1);
      expect(onConflictDoUpdate).toHaveBeenCalledTimes(1);
      const persisted = (
        values.mock.calls[0] as unknown[] | undefined
      )?.[0] as Record<string, unknown>;
      expect(persisted?.userId).toBe(USER_ID);
      expect(persisted?.date).toBe('2026-07-14');
      expect(persisted?.plan).toEqual(SAMPLE_PLAN);
      expect(result.date).toBe('2026-07-14');
      expect(result.plan).toEqual(SAMPLE_PLAN);
    });

    it('rejects a request with no plan', async () => {
      const { service } = buildService();
      await expect(service.acceptPlan(USER_ID, {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects a plan with a malformed date', async () => {
      const { service } = buildService();
      await expect(
        service.acceptPlan(USER_ID, {
          plan: { ...SAMPLE_PLAN, date: 'not-a-date' },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
