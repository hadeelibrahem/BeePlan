import {
  buildMemberAvailability,
  fallbackAvailability,
  intersectRanges,
  mergeRanges,
  subtractRanges,
  windowToDayRanges,
  type AvailabilityPreferences,
} from './member-availability';

const basePrefs: AvailabilityPreferences = {
  focusStartTime: '08:00',
  focusEndTime: '11:00',
  maxDailyWorkMinutes: 480,
  sleep: { start: '23:00', end: '07:00' },
  lunch: { start: '13:00', end: '13:45' },
  unavailableHours: [],
};

describe('range helpers', () => {
  it('windowToDayRanges splits a midnight-crossing window into two ranges', () => {
    expect(windowToDayRanges('23:00', '07:00')).toEqual([
      { start: 0, end: 420 },
      { start: 1380, end: 1440 },
    ]);
    expect(windowToDayRanges('13:00', '13:45')).toEqual([{ start: 780, end: 825 }]);
  });

  it('mergeRanges merges overlapping and adjacent ranges', () => {
    expect(mergeRanges([{ start: 0, end: 60 }, { start: 60, end: 120 }, { start: 30, end: 90 }])).toEqual([
      { start: 0, end: 120 },
    ]);
  });

  it('subtractRanges removes busy time clipped to the base window', () => {
    expect(subtractRanges([{ start: 480, end: 1260 }], [{ start: 780, end: 825 }])).toEqual([
      { start: 480, end: 780 },
      { start: 825, end: 1260 },
    ]);
  });

  it('intersectRanges returns the overlap only', () => {
    expect(intersectRanges([{ start: 480, end: 660 }], [{ start: 600, end: 900 }])).toEqual([
      { start: 600, end: 660 },
    ]);
  });
});

describe('buildMemberAvailability', () => {
  it('carves the working span into free windows around sleep and lunch', () => {
    const availability = buildMemberAvailability({
      userId: 'u1',
      displayName: 'Alice',
      offsetMinutes: 0,
      preferences: basePrefs,
      commitments: [],
      hasData: true,
    });
    // Working span 08:00–21:00, minus lunch 13:00–13:45. Sleep 23:00–07:00 falls
    // entirely outside the span so it does not carve anything.
    expect(availability.freeWindowsByWeekday[1]).toEqual([
      { start: 480, end: 780 },
      { start: 825, end: 1260 },
    ]);
    // Preferred window = free ∩ focus (08:00–11:00).
    expect(availability.preferredWindowsByWeekday[1]).toEqual([{ start: 480, end: 660 }]);
    expect(availability.maxDailyWorkMinutes).toBe(480);
    expect(availability.hasData).toBe(true);
  });

  it('subtracts a recurring commitment only on the weekdays it falls on', () => {
    const availability = buildMemberAvailability({
      userId: 'u1',
      displayName: 'Alice',
      offsetMinutes: 0,
      preferences: { ...basePrefs, lunch: { start: '13:00', end: '13:01' } },
      commitments: [{ isActive: true, daysOfWeek: [1], startTime: '09:00', endTime: '10:30' }],
      hasData: true,
    });
    // Monday (1) has the 09:00–10:30 commitment carved out; Tuesday (2) does not.
    expect(availability.freeWindowsByWeekday[1].some((w) => w.start === 540 && w.end === 630)).toBe(false);
    expect(availability.freeWindowsByWeekday[1][0]).toEqual({ start: 480, end: 540 });
    expect(availability.freeWindowsByWeekday[2][0]).toEqual({ start: 480, end: 780 });
  });

  it('an inactive commitment is ignored', () => {
    const availability = buildMemberAvailability({
      userId: 'u1',
      displayName: 'Alice',
      offsetMinutes: 0,
      preferences: basePrefs,
      commitments: [{ isActive: false, daysOfWeek: [1], startTime: '09:00', endTime: '10:30' }],
      hasData: true,
    });
    expect(availability.freeWindowsByWeekday[1][0]).toEqual({ start: 480, end: 780 });
  });

  it('fallback availability marks hasData false and uses the default cap', () => {
    const availability = fallbackAvailability('u2', 'Bob', 0);
    expect(availability.hasData).toBe(false);
    expect(availability.maxDailyWorkMinutes).toBe(480);
    expect(availability.freeWindowsByWeekday[3]).toEqual([{ start: 480, end: 1260 }]);
    expect(availability.preferredWindowsByWeekday[3]).toEqual([]);
  });
});
