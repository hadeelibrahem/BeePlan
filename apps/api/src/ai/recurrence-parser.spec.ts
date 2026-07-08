import {
  normalizeAiRecurrenceResponse,
  toApiDate,
  type AiRecurrenceParseResponse,
} from './recurrence-parser';

const CURRENT_DATE = '2026-07-07'; // Tuesday
const REFERENCE = new Date('2026-07-07T00:00:00Z');

describe('toApiDate', () => {
  it.each([
    ['August', '2026-08-31'],
    ['August 15', '2026-08-15'],
    ['31 Aug 2026', '2026-08-31'],
    ['Aug 31, 2026', '2026-08-31'],
    ['08/31/2026', '2026-08-31'],
    ['2026-08-31', '2026-08-31'],
    ['2026-08-31T00:00:00.000Z', '2026-08-31'],
  ])('normalizes %p to %p', (input, expected) => {
    expect(toApiDate(input, REFERENCE)).toBe(expected);
  });

  it('accepts Date objects', () => {
    expect(toApiDate(new Date('2026-08-31T12:00:00Z'), REFERENCE)).toBe('2026-08-31');
  });

  it('returns null for unparseable or empty values', () => {
    expect(toApiDate('whenever', REFERENCE)).toBeNull();
    expect(toApiDate('', REFERENCE)).toBeNull();
    expect(toApiDate(null, REFERENCE)).toBeNull();
    expect(toApiDate(undefined, REFERENCE)).toBeNull();
  });

  it('rejects impossible calendar dates', () => {
    expect(toApiDate('Feb 30, 2026', REFERENCE)).toBeNull();
  });

  it('only ever returns YYYY-MM-DD (never a month name or display text)', () => {
    for (const input of ['August', '31 Aug 2026', 'Aug 31, 2026', '08/31/2026']) {
      expect(toApiDate(input, REFERENCE)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

function endDateFor(rawEndDate: unknown): AiRecurrenceParseResponse {
  return normalizeAiRecurrenceResponse(
    {
      repeat: 'weekly',
      interval: 1,
      daysOfWeek: ['Monday'],
      dayOfMonth: null,
      endCondition: 'onDate',
      endDate: rawEndDate,
      occurrences: null,
      time: null,
      preview: 'x',
      confidence: 0.9,
      clarifyingQuestion: null,
    },
    CURRENT_DATE,
  );
}

describe('normalizeAiRecurrenceResponse endDate coercion', () => {
  it.each([
    ['August', '2026-08-31'],
    ['August 15', '2026-08-15'],
    ['Dec 1', '2026-12-01'],
    ['31 Aug 2026', '2026-08-31'],
    ['08/31/2026', '2026-08-31'],
    ['2026-08-31', '2026-08-31'],
    ['2026-08-31T00:00:00.000Z', '2026-08-31'],
    ['next Friday', '2026-07-10'],
  ])('converts %p to %p', (input, expected) => {
    const result = endDateFor(input);
    expect(result.endDate).toBe(expected);
    expect(result.endCondition).toBe('onDate');
  });

  it('never returns a month name or localized format', () => {
    const result = endDateFor('August');
    expect(result.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('falls back to a clarifying question for unparseable dates', () => {
    const result = endDateFor('whenever I feel like it');
    expect(result.endDate).toBeNull();
    expect(result.endCondition).toBe('never');
    expect(result.clarifyingQuestion).toBeTruthy();
  });

  it('rejects impossible calendar dates', () => {
    const result = endDateFor('Feb 30 2026');
    expect(result.endDate).toBeNull();
  });
});
