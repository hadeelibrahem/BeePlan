import { TaskContextExtractor } from './task-context.extractor';

describe('TaskContextExtractor schedule timezone semantics', () => {
  const extractor = new TaskContextExtractor();
  const input = (timezone: string, date = '2026-08-08', time = '19:30') =>
    extractor.extract({
      taskId: 'task',
      title: 'Online meeting',
      scheduledDate: date,
      scheduledStartTime: time,
      timezone,
    });

  it('converts a UTC+03 local task to its UTC instant once', () => {
    expect(input('Asia/Hebron').scheduledExecution).toBe(
      '2026-08-08T16:30:00.000Z',
    );
  });

  it('preserves UTC schedules', () => {
    expect(input('UTC').scheduledExecution).toBe('2026-08-08T19:30:00.000Z');
  });

  it('supports negative offsets', () => {
    expect(input('America/New_York').scheduledExecution).toBe(
      '2026-08-08T23:30:00.000Z',
    );
  });

  it('applies DST through the IANA timezone rules', () => {
    expect(input('America/New_York', '2026-01-10').scheduledExecution).toBe(
      '2026-01-11T00:30:00.000Z',
    );
  });
});
