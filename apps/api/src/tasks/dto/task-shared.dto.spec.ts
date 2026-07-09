import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { TaskRecurrenceDto } from './task-shared.dto';

// Mirrors what the global ValidationPipe ({ transform: true }) does: run the
// class-transformer @Transform hooks, then validate.
function buildRecurrence(overrides: Record<string, unknown>) {
  const instance = plainToInstance(TaskRecurrenceDto, {
    frequency: 'Weekly',
    weekdays: ['Monday'],
    endType: 'date',
    ...overrides,
  });
  const errors = validateSync(instance as object);
  return { instance, errors };
}

describe('TaskRecurrenceDto endDate normalization', () => {
  it.each([
    ['Aug 31, 2026', '2026-08-31'],
    ['31 Aug 2026', '2026-08-31'],
    ['08/31/2026', '2026-08-31'],
    ['2026-08-31', '2026-08-31'],
    ['2026-08-31T00:00:00.000Z', '2026-08-31'],
  ])('coerces display date %p to ISO %p and validates', (input, expected) => {
    const { instance, errors } = buildRecurrence({ endDate: input });
    expect(instance.endDate).toBe(expected);
    expect(errors).toHaveLength(0);
  });

  it('drops an empty end date so a never-ending recurrence still validates', () => {
    const { instance, errors } = buildRecurrence({ endType: 'never', endDate: '' });
    expect(instance.endDate).toBeUndefined();
    expect(errors).toHaveLength(0);
  });

  it('rejects an unparseable date with a clear message', () => {
    const { errors } = buildRecurrence({ endDate: 'whenever I feel like it' });
    expect(errors).toHaveLength(1);
    expect(Object.values(errors[0].constraints ?? {})).toContain(
      'Recurrence end date must be a valid date (YYYY-MM-DD).',
    );
  });
});
