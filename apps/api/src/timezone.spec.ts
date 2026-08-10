import { isValidIanaTimezone } from './timezone';

describe('timezone validation', () => {
  it('accepts canonical IANA zones', () => {
    expect(isValidIanaTimezone('Asia/Hebron')).toBe(true);
    expect(isValidIanaTimezone('America/New_York')).toBe(true);
  });

  it('rejects offset strings and arbitrary values', () => {
    expect(isValidIanaTimezone('UTC+03:00')).toBe(false);
    expect(isValidIanaTimezone('not-a-timezone')).toBe(false);
  });
});
