import { TaskContextClassifier } from './task-context.classifier';
import { TaskContextExtractor } from './task-context.extractor';

const extractor = new TaskContextExtractor();
const classifier = new TaskContextClassifier();
const classify = (title: string, extra: Record<string, unknown> = {}) =>
  classifier.classify(extractor.extract({ taskId: 'task', title, ...extra }));

describe('TaskContextClassifier', () => {
  it.each([
    ['Travel to Canada', 'travel'],
    ['Flight to Toronto airport', 'flight'],
    ['Job interview at 10', 'interview'],
    ['Attend university lecture', 'university'],
    ['Doctor appointment', 'medical'],
    ['Buy medicine at pharmacy', 'pharmacy'],
    ['Join Zoom online meeting', 'online_meeting'],
    ['Outdoor running workout', 'exercise'],
  ])('classifies %s', (title, expected) =>
    expect(classify(title).primaryContext).toBe(expected),
  );
  it('returns unavailable for ambiguous work', () =>
    expect(classify('Handle it').confidence).toBe('unavailable'));
  it('honors a user correction', () =>
    expect(
      classify('Handle it', { correctedContext: 'interview' }).primaryContext,
    ).toBe('interview'));
  it('supports secondary contexts', () => {
    const result = classify('Travel to Canada for a work conference');
    expect(result.primaryContext).toBe('travel');
    expect(result.secondaryContexts).toContain('work');
  });
});
