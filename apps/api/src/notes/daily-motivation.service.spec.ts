import { DailyMotivationService } from './daily-motivation.service';
import type { DailyMotivationSummary } from './daily-motivation.logic';

const summary: DailyMotivationSummary = {
  completedTasks: 2, completedSubtasks: 1, focusSessions: 2, focusMinutes: 50,
  highPriorityCompleted: 1, inProgressTasks: 1, remainingPlannedTasks: 2,
  completedReminders: 0, recentCompletedTitles: ['Review chapter'],
  latestActivityTimestamp: '2026-07-24T10:00:00.000Z',
};

function build(aiResult: string | Error) {
  const db = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ timezone: 'Asia/Hebron' }] }) }) }),
  };
  const aiService = { generateDailyMotivation: jest.fn() };
  if (aiResult instanceof Error) aiService.generateDailyMotivation.mockRejectedValue(aiResult);
  else aiService.generateDailyMotivation.mockResolvedValue(aiResult);
  const service = new DailyMotivationService({ db } as never, aiService as never);
  jest.spyOn(service as never, 'getSummary').mockResolvedValue(summary);
  return { service, aiService };
}

describe('DailyMotivationService', () => {
  it('uses AI output when it is valid and caches an unchanged fingerprint', async () => {
    const { service, aiService } = build('You completed two tasks today, so let your next focused step stay calm and clear.');
    const first = await service.getForUser('user', undefined, 'en', new Date('2026-07-24T10:30:00.000Z'));
    const second = await service.getForUser('user', undefined, 'en', new Date('2026-07-24T10:31:00.000Z'));
    expect(first.source).toBe('ai');
    expect(second.message).toBe(first.message);
    expect(aiService.generateDailyMotivation).toHaveBeenCalledTimes(1);
  });

  it('generates a fresh message when the activity fingerprint changes', async () => {
    const { service, aiService } = build('You completed two tasks today, so let your next focused step stay calm and clear.');
    const getSummary = jest.spyOn(service as never, 'getSummary');
    await service.getForUser('user', undefined, 'en', new Date('2026-07-24T10:30:00.000Z'));
    getSummary.mockResolvedValue({ ...summary, focusMinutes: 75 });
    await service.getForUser('user', undefined, 'en', new Date('2026-07-24T10:31:00.000Z'));
    expect(aiService.generateDailyMotivation).toHaveBeenCalledTimes(2);
  });

  it('uses deterministic fallback for an AI timeout or invalid response', async () => {
    const timeout = build(new Error('timeout'));
    expect((await timeout.service.getForUser('user', undefined, 'en')).source).toBe('fallback');
    const invalid = build('Too short');
    expect((await invalid.service.getForUser('user', undefined, 'en')).source).toBe('fallback');
  });

  it('falls back to the requested timezone when a stored timezone is invalid', async () => {
    const db = {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ timezone: 'not/a-zone' }] }) }) }),
    };
    const aiService = { generateDailyMotivation: jest.fn().mockResolvedValue('You completed two tasks today, so let your next focused step stay calm and clear.') };
    const service = new DailyMotivationService({ db } as never, aiService as never);
    jest.spyOn(service as never, 'getSummary').mockResolvedValue(summary);
    const result = await service.getForUser('user', 'Asia/Tokyo', 'en', new Date('2026-07-24T15:30:00.000Z'));
    expect(result.localDate).toBe('2026-07-25');
  });
});
