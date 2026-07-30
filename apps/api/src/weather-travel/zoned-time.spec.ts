import { BadRequestException } from '@nestjs/common';
import { zonedDateTime } from './zoned-time';
describe('zonedDateTime', () => {
  it('maps Asia/Hebron local schedule to the correct UTC instant', () => {
    expect(
      zonedDateTime('2026-07-29', '14:00', 'Asia/Hebron').toISOString(),
    ).toBe('2026-07-29T11:00:00.000Z');
  });
  it('is DST-safe and rejects nonexistent wall clock times', () => {
    expect(() => zonedDateTime('2026-03-28', '02:30', 'Asia/Hebron')).toThrow(
      BadRequestException,
    );
  });
  it('rejects invalid timezones', () => {
    expect(() => zonedDateTime('2026-07-29', '14:00', 'Not/AZone')).toThrow(
      BadRequestException,
    );
  });
});
