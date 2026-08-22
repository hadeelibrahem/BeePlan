import { sortActionItems, toIsoTimestamp, type AdminActionItem } from './admin-action-center.service';

describe('toIsoTimestamp', () => {
  it.each([
    ['a Date', new Date('2026-01-02T03:04:05.000Z'), '2026-01-02T03:04:05.000Z'],
    ['an ISO string', '2026-01-02T03:04:05.000Z', '2026-01-02T03:04:05.000Z'],
    ['a database timestamp string', '2026-01-02 03:04:05+00', '2026-01-02T03:04:05.000Z'],
  ])('%s normalizes safely', (_label, value, expected) => {
    expect(toIsoTimestamp(value as Date | string)).toBe(expected);
  });

  it('returns null for null timestamps', () => {
    expect(toIsoTimestamp(null)).toBeNull();
    expect(toIsoTimestamp(undefined)).toBeNull();
  });

  it('returns null for invalid timestamps without throwing', () => {
    expect(() => toIsoTimestamp('not-a-timestamp')).not.toThrow();
    expect(toIsoTimestamp('not-a-timestamp')).toBeNull();
  });
});

const item = (overrides: Partial<AdminActionItem>): AdminActionItem => ({
  id: 'item', type: 'error', severity: 'low', title: 'Title', description: 'Description', detectedAt: '2026-01-01T00:00:00.000Z', ...overrides,
});

describe('Admin Action Center ordering', () => {
  it('returns an empty list unchanged', () => {
    expect(sortActionItems([])).toEqual([]);
  });

  it('orders severities from critical through low', () => {
    expect(sortActionItems([
      item({ id: 'low', severity: 'low' }), item({ id: 'medium', severity: 'medium' }),
      item({ id: 'high', severity: 'high' }), item({ id: 'critical', severity: 'critical' }),
    ]).map(({ id }) => id)).toEqual(['critical', 'high', 'medium', 'low']);
  });

  it('uses newest detection time within a severity', () => {
    expect(sortActionItems([
      item({ id: 'older', severity: 'high', detectedAt: '2026-01-01T00:00:00.000Z' }),
      item({ id: 'newer', severity: 'high', detectedAt: '2026-01-02T00:00:00.000Z' }),
    ]).map(({ id }) => id)).toEqual(['newer', 'older']);
  });

  it('uses the id as a deterministic final tie breaker', () => {
    expect(sortActionItems([item({ id: 'b' }), item({ id: 'a' })]).map(({ id }) => id)).toEqual(['a', 'b']);
  });
});
