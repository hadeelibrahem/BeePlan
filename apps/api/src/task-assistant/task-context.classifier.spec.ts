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
  it('keeps the exact Trip to University scenario as university', () => {
    const result = classify('Trip to University', {
      description: 'I need to travel to University and bring my laptop, charger and documents',
      destination: {
        displayName: 'Al Najah University',
        latitude: 32.2211,
        longitude: 35.2544,
      },
    });
    expect(result.primaryContext).toBe('university');
    expect(result.confidence).toBe('high');
    expect(result.likelyEquipment).toEqual(['laptop', 'charger']);
  });
  it('does not turn a destination into a travel secondary context', () => {
    const result = classify('Job interview', {
      description: 'Interview for a software developer position. I need my CV, laptop and charger.',
      destination: { displayName: 'Company office', latitude: 32.2, longitude: 35.2 },
    });
    expect(result.primaryContext).toBe('interview');
    expect(result.secondaryContexts).not.toContain('travel');
  });
});
