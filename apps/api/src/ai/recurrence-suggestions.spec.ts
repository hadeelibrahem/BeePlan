import {
  detectRecurrenceSuggestions,
  type RecurrenceSuggestionTask,
} from './recurrence-suggestions';

function task(
  title: string,
  date: string,
  overrides: Partial<RecurrenceSuggestionTask> = {},
): RecurrenceSuggestionTask {
  return {
    id: `${title}-${date}-${Math.random()}`,
    title,
    category: 'Personal',
    dueDate: `${date}T08:00:00.000Z`,
    dueTime: '08:00',
    status: 'done',
    createdAt: `${date}T07:00:00.000Z`,
    updatedAt: `${date}T09:00:00.000Z`,
    ...overrides,
  };
}

describe('detectRecurrenceSuggestions', () => {
  it('detects daily repeated tasks', () => {
    const suggestions = detectRecurrenceSuggestions([
      task('Drink water', '2026-07-01'),
      task('Drink water', '2026-07-02'),
      task('Drink water', '2026-07-03'),
      task('Drink water', '2026-07-04'),
    ]);

    expect(suggestions[0]).toMatchObject({
      taskTitle: 'Drink water',
      repeat: 'daily',
      interval: 1,
      suggestedTime: '08:00',
    });
  });

  it('detects weekly same-day patterns', () => {
    const suggestions = detectRecurrenceSuggestions([
      task('Gym', '2026-07-05'),
      task('Gym', '2026-07-12'),
      task('Gym', '2026-07-19'),
    ]);

    expect(suggestions[0]).toMatchObject({
      repeat: 'weekly',
      daysOfWeek: ['Sunday'],
    });
  });

  it('detects weekday patterns', () => {
    const suggestions = detectRecurrenceSuggestions([
      task('Study English', '2026-07-06'),
      task('Study English', '2026-07-07'),
      task('Study English', '2026-07-08'),
      task('Study English', '2026-07-09'),
      task('Study English', '2026-07-10'),
    ]);

    expect(suggestions[0]).toMatchObject({
      repeat: 'weekly',
      daysOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    });
  });

  it('detects monthly same-date patterns', () => {
    const suggestions = detectRecurrenceSuggestions([
      task('Pay rent', '2026-01-01'),
      task('Pay rent', '2026-02-01'),
      task('Pay rent', '2026-03-01'),
    ]);

    expect(suggestions[0]).toMatchObject({
      repeat: 'monthly',
      dayOfMonth: 1,
    });
  });

  it('groups highly similar titles', () => {
    const suggestions = detectRecurrenceSuggestions([
      task('Study English', '2026-07-01'),
      task('English study', '2026-07-02'),
      task('Practice English', '2026-07-03'),
      task('Study English', '2026-07-04'),
    ]);

    expect(suggestions[0]).toMatchObject({
      repeat: 'daily',
      taskTitle: 'Study English',
    });
  });

  it('ignores already-recurring tasks', () => {
    const suggestions = detectRecurrenceSuggestions([
      task('Gym', '2026-07-05', { isRecurring: true }),
      task('Gym', '2026-07-12', { isRecurring: true }),
      task('Gym', '2026-07-19', { isRecurring: true }),
    ]);

    expect(suggestions).toEqual([]);
  });

  it('ignores low-confidence patterns', () => {
    const suggestions = detectRecurrenceSuggestions([
      task('Read book', '2026-07-01'),
      task('Read book', '2026-07-11'),
    ]);

    expect(suggestions).toEqual([]);
  });

  it('hides dismissed suggestions', () => {
    const tasks = [
      task('Drink water', '2026-07-01'),
      task('Drink water', '2026-07-02'),
      task('Drink water', '2026-07-03'),
      task('Drink water', '2026-07-04'),
    ];
    const [suggestion] = detectRecurrenceSuggestions(tasks);

    const suggestions = detectRecurrenceSuggestions(tasks, new Set([suggestion.id]));

    expect(suggestions).toEqual([]);
  });
});
