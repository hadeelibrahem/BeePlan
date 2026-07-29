import { DepartureTimeEngine } from './departure-time.engine';
import { zonedDateTime } from './zoned-time';

describe('DepartureTimeEngine', () => {
  const engine = new DepartureTimeEngine();
  it('subtracts route and all deterministic buffers', () => {
    const result = engine.calculate({
      scheduledDate: '2026-07-29',
      scheduledStartTime: '14:00',
      timezone: 'Asia/Hebron',
      routeDurationMinutes: 35,
      preparationBufferMinutes: 10,
      parkingWalkingBufferMinutes: 0,
      uncertaintyBufferMinutes: 5,
    });
    expect(result.totalLeadMinutes).toBe(50);
    expect(
      new Intl.DateTimeFormat('en', {
        timeZone: 'Asia/Hebron',
        hourCycle: 'h23',
        hour: '2-digit',
        minute: '2-digit',
      }).format(result.recommendedDeparture),
    ).toBe('13:10');
  });
  it('calculates a dynamic weather lead before departure', () => {
    const departure = zonedDateTime('2026-07-29', '13:10', 'Asia/Hebron');
    expect(
      engine.notificationTime(departure, new Date(), 15).toISOString(),
    ).toBe(new Date(departure.getTime() - 900_000).toISOString());
  });
});
