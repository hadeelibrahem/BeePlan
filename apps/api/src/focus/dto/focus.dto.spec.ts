import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ExtendFocusSessionDto } from './focus.dto';

/**
 * Mirrors the global ValidationPipe ({ transform: true, whitelist: true }) so
 * these assertions reflect exactly what reaches the controller.
 */
function validateExtend(payload: unknown): string[] {
  const instance = plainToInstance(ExtendFocusSessionDto, payload);
  return validateSync(instance as object).flatMap((error) =>
    Object.values(error.constraints ?? {}),
  );
}

describe('ExtendFocusSessionDto', () => {
  it('accepts a positive whole number within range', () => {
    expect(validateExtend({ additionalMinutes: 25 })).toHaveLength(0);
  });

  it('accepts the minimum (1) and maximum (480)', () => {
    expect(validateExtend({ additionalMinutes: 1 })).toHaveLength(0);
    expect(validateExtend({ additionalMinutes: 480 })).toHaveLength(0);
  });

  it('rejects zero', () => {
    expect(validateExtend({ additionalMinutes: 0 }).length).toBeGreaterThan(0);
  });

  it('rejects negative values', () => {
    expect(validateExtend({ additionalMinutes: -5 }).length).toBeGreaterThan(0);
  });

  it('rejects decimals', () => {
    expect(validateExtend({ additionalMinutes: 5.5 }).length).toBeGreaterThan(0);
  });

  it('rejects values over the 480-minute limit', () => {
    expect(validateExtend({ additionalMinutes: 481 }).length).toBeGreaterThan(0);
  });

  it('rejects a missing value', () => {
    expect(validateExtend({}).length).toBeGreaterThan(0);
  });

  it('rejects a non-numeric value', () => {
    expect(
      validateExtend({ additionalMinutes: 'abc' }).length,
    ).toBeGreaterThan(0);
  });
});
