import { ConfigService } from '@nestjs/config';
import { SystemHealthService, overallHealth } from './system-health.service';

describe('SystemHealthService', () => {
  it('derives operational, degraded, and major outage states from server checks', () => {
    const item = (status: any, criticality: any = 'optional') => ({
      status,
      criticality,
    });
    expect(overallHealth([item('healthy', 'critical')])).toBe('operational');
    expect(
      overallHealth([
        item('unknown', 'optional'),
        item('degraded', 'important'),
      ]),
    ).toBe('degraded');
    expect(overallHealth([item('unavailable', 'critical')])).toBe(
      'major_outage',
    );
  });

  it('returns a safe unavailable database result without exposing errors', async () => {
    const database = {
      db: {
        execute: jest.fn().mockRejectedValue(new Error('DATABASE_URL=secret')),
      },
    };
    const service = new SystemHealthService(
      database as never,
      new ConfigService({ NODE_ENV: 'test' }),
    );
    const result = await service.getHealth();
    const db = result.services.find((item) => item.id === 'database');
    expect(db?.status).toBe('unavailable');
    expect(JSON.stringify(result)).not.toContain('DATABASE_URL');
    expect(result.overallStatus).toBe('major_outage');
    expect(
      result.summary.healthy +
        result.summary.degraded +
        result.summary.unavailable +
        result.summary.unknown,
    ).toBe(result.services.length);
  });

  it('does not report a removed Google Calendar service or worker', async () => {
    const database = {
      db: {
        execute: jest.fn().mockResolvedValue({}),
        select: jest.fn(() => ({
          from: jest.fn(() => ({
            groupBy: jest.fn().mockResolvedValue([]),
          })),
        })),
      },
    };
    const result = await new SystemHealthService(
      database as never,
      new ConfigService(),
    ).getHealth();
    expect(
      result.services.some(
        (item) =>
          item.id === 'google-calendar' && item.category === 'Product Services',
      ),
    ).toBe(false);
    expect(
      result.workers.some((item) => item.id === 'google-calendar-worker'),
    ).toBe(false);
  });
});
