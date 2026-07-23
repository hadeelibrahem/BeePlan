import {
  commitmentAppliesOn,
  commitmentsToBusyWindows,
  weekdayOf,
} from './recurring-commitments.service';
import type { RecurringCommitment } from './entities/personal-context.types';

// Reference weekdays (0 = Sun .. 6 = Sat):
//   2021-01-03 = Sunday(0), 2021-01-04 = Monday(1), 2021-01-06 = Wednesday(3),
//   2021-01-07 = Thursday(4), 2021-01-11 = Monday(1).
describe('weekdayOf', () => {
  it('returns the correct weekday number', () => {
    expect(weekdayOf('2021-01-03')).toBe(0);
    expect(weekdayOf('2021-01-04')).toBe(1);
    expect(weekdayOf('2021-01-06')).toBe(3);
  });

  it('returns null for a malformed date', () => {
    expect(weekdayOf('not-a-date')).toBeNull();
  });
});

function commitment(
  overrides: Partial<
    Pick<
      RecurringCommitment,
      'isActive' | 'daysOfWeek' | 'startDate' | 'endDate' | 'repeatWeekly'
    >
  >,
): Pick<
  RecurringCommitment,
  'isActive' | 'daysOfWeek' | 'startDate' | 'endDate' | 'repeatWeekly'
> {
  return {
    isActive: true,
    daysOfWeek: [1, 2, 3], // Mon, Tue, Wed
    startDate: null,
    endDate: null,
    repeatWeekly: true,
    ...overrides,
  };
}

describe('commitmentAppliesOn', () => {
  it('applies on a matching weekday', () => {
    expect(commitmentAppliesOn(commitment({}), '2021-01-04')).toBe(true); // Monday
  });

  it('does not apply on a non-matching weekday', () => {
    expect(commitmentAppliesOn(commitment({}), '2021-01-07')).toBe(false); // Thursday
  });

  it('never applies when inactive (temporary disable)', () => {
    expect(commitmentAppliesOn(commitment({ isActive: false }), '2021-01-04')).toBe(false);
  });

  it('respects startDate / endDate bounds', () => {
    expect(commitmentAppliesOn(commitment({ startDate: '2021-01-05' }), '2021-01-04')).toBe(false);
    expect(commitmentAppliesOn(commitment({ endDate: '2021-01-05' }), '2021-01-06')).toBe(false);
    expect(commitmentAppliesOn(commitment({ startDate: '2021-01-01', endDate: '2021-01-31' }), '2021-01-06')).toBe(true);
  });

  it('limits a non-repeating commitment to the week of its start date', () => {
    const single = commitment({ repeatWeekly: false, startDate: '2021-01-04' });
    expect(commitmentAppliesOn(single, '2021-01-06')).toBe(true); // same week (Wed)
    expect(commitmentAppliesOn(single, '2021-01-11')).toBe(false); // next Monday, out of window
  });
});

describe('commitmentsToBusyWindows', () => {
  it('maps applicable commitments to busy intervals for the date', () => {
    const commitments: RecurringCommitment[] = [
      {
        id: 'c1',
        title: 'University Classes',
        daysOfWeek: [1, 2, 3],
        startTime: '08:00',
        endTime: '11:00',
        savedLocationId: 'p1',
        savedLocationName: 'University',
        repeatWeekly: true,
        startDate: null,
        endDate: null,
        isActive: true,
        notes: null,
        createdAt: '2021-01-01T00:00:00.000Z',
        updatedAt: '2021-01-01T00:00:00.000Z',
      },
      {
        id: 'c2',
        title: 'Weekend Volunteering',
        daysOfWeek: [0], // Sunday only
        startTime: '09:00',
        endTime: '12:00',
        savedLocationId: null,
        savedLocationName: null,
        repeatWeekly: true,
        startDate: null,
        endDate: null,
        isActive: true,
        notes: null,
        createdAt: '2021-01-01T00:00:00.000Z',
        updatedAt: '2021-01-01T00:00:00.000Z',
      },
    ];

    const windows = commitmentsToBusyWindows(commitments, '2021-01-04'); // Monday
    expect(windows).toEqual([
      {
        commitmentId: 'c1',
        title: 'University Classes',
        start: '08:00',
        end: '11:00',
        placeName: 'University',
      },
    ]);
  });
});
