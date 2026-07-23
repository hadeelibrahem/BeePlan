import { DASHBOARD_FALLBACK_TIMEZONE, getDashboardDayBoundaries, resolveDashboardTimezone } from './dashboard-timezone';

describe('dashboard timezone boundaries', () => {
  it('uses a positive UTC offset around local midnight', () => {
    const result = getDashboardDayBoundaries('Asia/Tokyo', new Date('2026-07-21T15:30:00.000Z'));
    expect(result.localDate).toBe('2026-07-22');
    expect(result.startOfToday.toISOString()).toBe('2026-07-21T15:00:00.000Z');
  });
  it('uses a negative UTC offset for the local day', () => {
    const result = getDashboardDayBoundaries('America/Los_Angeles', new Date('2026-07-21T06:30:00.000Z'));
    expect(result.localDate).toBe('2026-07-20');
    expect(result.startOfTomorrow.toISOString()).toBe('2026-07-21T07:00:00.000Z');
  });
  it('places due work and focus sessions in the correct local day across UTC midnight', () => {
    const result = getDashboardDayBoundaries('America/Los_Angeles', new Date('2026-07-21T06:30:00.000Z'));
    const localEvening = new Date('2026-07-21T06:00:00.000Z'); // 23:00 on July 20 locally
    expect(localEvening >= result.startOfToday && localEvening < result.startOfTomorrow).toBe(true);
    const nextLocalDay = new Date('2026-07-21T07:30:00.000Z');
    expect(nextLocalDay >= result.startOfToday && nextLocalDay < result.startOfTomorrow).toBe(false);
  });
  it('observes daylight saving boundaries', () => {
    const result = getDashboardDayBoundaries('America/New_York', new Date('2026-03-08T16:00:00.000Z'));
    expect(result.startOfTomorrow.getTime() - result.startOfToday.getTime()).toBe(23 * 60 * 60 * 1000);
  });
  it('falls back for missing or invalid timezones', () => {
    expect(resolveDashboardTimezone(undefined)).toBe(DASHBOARD_FALLBACK_TIMEZONE);
    expect(resolveDashboardTimezone('not/a-zone')).toBe(DASHBOARD_FALLBACK_TIMEZONE);
  });
});
