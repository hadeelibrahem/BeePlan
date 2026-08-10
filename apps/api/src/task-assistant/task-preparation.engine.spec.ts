import { TaskContextClassifier } from './task-context.classifier';
import { TaskContextExtractor } from './task-context.extractor';
import { TaskPreparationEngine } from './task-preparation.engine';
import type { TaskAssistantPreferences } from './task-assistant.types';
import type { Destination } from '../weather-travel/weather-travel.types';

const preferences: TaskAssistantPreferences = {
  enabled: true,
  preparationChecklistsEnabled: true,
  travelAdviceEnabled: true,
  weatherAdviceEnabled: true,
  documentAdviceEnabled: true,
  clothingAdviceEnabled: true,
  umbrellaAdviceEnabled: true,
  hydrationAdviceEnabled: true,
  notificationMode: 'smart',
  defaultTravelMode: 'driving',
  language: 'en',
};
const build = (title: string, destination?: Destination) =>
  new TaskPreparationEngine().generate(
    new TaskContextClassifier().classify(
      new TaskContextExtractor().extract({
        taskId: 'task',
        title,
        destination,
      }),
    ),
    preferences,
  );

describe('TaskPreparationEngine', () => {
  it('suggests passport checks non-assertively for international travel', () => {
    const items = build('Travel to Canada', {
      displayName: 'Toronto, Canada',
      latitude: 1,
      longitude: 1,
    });
    expect(items.map((item) => item.type)).toContain('passport_check');
    expect(
      items.find((item) => item.type === 'entry_requirements_check')
        ?.description,
    ).toContain('official');
  });
  it('does not suggest a passport for local shopping', () =>
    expect(
      build('Buy groceries nearby').map((item) => item.type),
    ).not.toContain('passport_check'));
  it.each([
    ['Job interview', 'cv'],
    ['Attend university lecture', 'laptop_charger'],
    ['Visit pharmacy for medicine', 'prescription'],
    ['Join Zoom online meeting', 'meeting_link'],
  ])('adds relevant preparation for %s', (title, type) =>
    expect(build(title).map((item) => item.type)).toContain(type),
  );
  it('does not emit generic advice for an ambiguous task', () =>
    expect(build('Handle it')).toHaveLength(0));
  it('returns the university laptop and study preparation for the exact scenario', () => {
    const items = build('Trip to University', {
      displayName: 'Al Najah University',
      latitude: 32.2211,
      longitude: 35.2544,
    });
    expect(items.map((item) => item.type)).toEqual(
      expect.arrayContaining(['laptop_charger', 'study_materials']),
    );
  });
  it('keeps interview preparation separate from travel packing while preserving mentioned devices', () => {
    const context = new TaskContextClassifier().classify(new TaskContextExtractor().extract({
      taskId: 'interview',
      title: 'Job interview',
      description: 'Interview for a software developer position. I need my CV, laptop and charger.',
      destination: { displayName: 'Company office', latitude: 32.2, longitude: 35.2 },
    }));
    const items = new TaskPreparationEngine().generate(context, preferences);
    expect(items.map((item) => item.type)).toEqual(expect.arrayContaining(['cv', 'interview_details']));
    expect(items.map((item) => item.type)).not.toContain('passport_check');
    expect(context.secondaryContexts).not.toContain('travel');
  });
});
