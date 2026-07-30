import {
  isValidRadiusMeters,
  validateRadiusMetersText,
} from './radiusValidation';

describe('location reminder radius validation', () => {
  it.each([10, 150, 347, 5000])('accepts valid integer %s unchanged', (radius) => {
    expect(isValidRadiusMeters(radius)).toBe(true);
    expect(validateRadiusMetersText(String(radius))).toBeNull();
    expect(Number(String(radius))).toBe(radius);
  });

  it.each(['', '9', '5001', '1.5', '-10', 'abc'])(
    'rejects invalid input %s',
    (radius) => {
      expect(validateRadiusMetersText(radius)).toMatch(/Radius must/);
    },
  );
});
