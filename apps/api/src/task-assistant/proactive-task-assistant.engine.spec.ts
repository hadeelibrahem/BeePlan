import { ContextTimelineEngine } from './context-timeline.engine';
import { ContextualNotificationEngine } from './contextual-notification.engine';
import { DynamicPackingListEngine } from './dynamic-packing-list.engine';
import { ProactiveTaskAssistantEngine } from './proactive-task-assistant.engine';
import { zonedDateTime } from '../weather-travel/zoned-time';
import type {
  ClassifiedTaskContext,
  TaskAssistantPreferences,
} from './task-assistant.types';

const preferences: TaskAssistantPreferences = {
  enabled: true,
  preparationChecklistsEnabled: true,
  travelAdviceEnabled: true,
  weatherAdviceEnabled: true,
  documentAdviceEnabled: true,
  clothingAdviceEnabled: true,
  umbrellaAdviceEnabled: true,
  hydrationAdviceEnabled: true,
  proactiveAssistanceEnabled: true,
  dynamicPreparationEnabled: true,
  dynamicPackingEnabled: true,
  contextTimelineEnabled: true,
  contextualNotificationsEnabled: true,
  electronicsAdviceEnabled: true,
  medicationAdviceEnabled: true,
  departureRemindersEnabled: true,
  notificationMode: 'smart',
  defaultTravelMode: 'driving',
  language: 'en',
};
const context = (
  overrides: Partial<ClassifiedTaskContext> = {},
): ClassifiedTaskContext => ({
  taskId: 'task',
  title: 'Travel to Canada',
  text: 'travel to canada for seven days',
  primaryContext: 'travel',
  secondaryContexts: ['flight'],
  confidence: 'high',
  confidenceReason: 'Explicit travel wording.',
  assumptions: [],
  destination: {
    displayName: 'Toronto, Canada',
    latitude: 43.65,
    longitude: -79.38,
  },
  scheduledDate: '2030-06-10',
  scheduledStartTime: '10:00',
  scheduledExecution: '2030-06-10T10:00:00',
  deadline: null,
  travelRequired: true,
  likelyDocuments: [],
  likelyEquipment: [],
  likelyClothingNeeds: [],
  externalFactsRequired: [],
  ...overrides,
});

describe('proactive task assistant engines', () => {
  it('creates duration and verified-weather-aware packing without inventing adapter compatibility', () => {
    const items = new DynamicPackingListEngine().generate(
      context(),
      preferences,
      { tripDays: 7, cold: true, rain: true },
    );
    expect(items.map((item) => item.type)).toEqual(
      expect.arrayContaining([
        'packing_passport',
        'packing_clothes',
        'packing_warm_layers',
        'packing_rain_protection',
      ]),
    );
    expect(items.map((item) => item.type)).not.toContain('packing_adapter');
  });
  it('uses flexible clothing wording when duration is missing', () =>
    expect(
      new DynamicPackingListEngine()
        .generate(context(), preferences)
        .find((item) => item.type === 'packing_clothes')?.title,
    ).toContain('Enough'));
  it('does not regenerate completed or dismissed types', () =>
    expect(
      new DynamicPackingListEngine()
        .generate(context(), preferences, {}, new Set(['packing_passport']))
        .map((item) => item.type),
    ).not.toContain('packing_passport'));
  it('builds grouped document, packing, final-check and departure stages', () => {
    const stages = new ContextTimelineEngine().generate(
      context(),
      new Date('2030-06-01T00:00:00Z'),
      new Date('2030-06-10T07:00:00'),
    );
    expect(stages.map((stage) => stage.stageType)).toEqual([
      'document_check',
      'packing',
      'final_check',
      'departure',
    ]);
  });
  it('suppresses notifications for low confidence', () =>
    expect(
      new ContextTimelineEngine().generate(
        context({ confidence: 'low' }),
        new Date('2030-06-01'),
      ),
    ).toHaveLength(0));
  it('applies minimal and important-only notification policies', () => {
    const stages = new ContextTimelineEngine().generate(
      context(),
      new Date('2030-06-01'),
      new Date('2030-06-10T07:00:00'),
    );
    const engine = new ContextualNotificationEngine();
    expect(
      engine.generate('user', 'task', 'v1', stages, {
        ...preferences,
        notificationMode: 'minimal',
      }),
    ).toHaveLength(2);
    expect(
      engine
        .generate('user', 'task', 'v1', stages, {
          ...preferences,
          notificationMode: 'important_only',
        })
        .every((item) => ['high', 'critical'].includes(item.priority)),
    ).toBe(true);
  });
  it('produces stable notification fingerprints', () => {
    const stages = new ContextTimelineEngine().generate(
      context(),
      new Date('2030-06-01'),
      new Date('2030-06-10T07:00:00'),
    );
    const engine = new ContextualNotificationEngine();
    expect(
      engine.generate('user', 'task', 'v1', stages, preferences)[0].fingerprint,
    ).toBe(
      engine.generate('user', 'task', 'v1', stages, preferences)[0].fingerprint,
    );
  });
  it('returns one combined proactive evaluation', () => {
    const engine = new ProactiveTaskAssistantEngine(
      new DynamicPackingListEngine(),
      new ContextTimelineEngine(),
      new ContextualNotificationEngine(),
    );
    expect(
      engine.evaluate({
        userId: 'user',
        context: context(),
        preferences,
        scheduleVersion: 'v1',
        now: new Date('2030-06-01'),
      }).timelineStages.length,
    ).toBeGreaterThan(0);
  });
  it('schedules an online meeting notification at 20 minutes before the local start', () => {
    const localStart = zonedDateTime('2026-08-08', '19:30', 'Asia/Hebron');
    const stages = new ContextTimelineEngine().generate(
      context({
        title: 'Online meeting',
        text: 'online meeting',
        primaryContext: 'online_meeting',
        secondaryContexts: [],
        scheduledExecution: localStart.toISOString(),
      }),
      new Date('2026-08-08T12:00:00.000Z'),
    );
    expect(stages[0]?.scheduledAt.toISOString()).toBe(
      '2026-08-08T16:10:00.000Z',
    );
  });
  it('carries university packing suggestions into the combined evaluation', () => {
    const engine = new ProactiveTaskAssistantEngine(
      new DynamicPackingListEngine(),
      new ContextTimelineEngine(),
      new ContextualNotificationEngine(),
    );
    const result = engine.evaluate({
      userId: 'user',
      context: context({
        title: 'Trip to University',
        text: 'trip to university bring laptop charger documents',
        primaryContext: 'university',
        secondaryContexts: ['travel'],
      }),
      preferences,
      scheduleVersion: 'v1',
    });
    expect(result.packingNeeds.map((item) => item.type)).toContain('packing_charger');
  });
  it('does not add trip clothes or medication to an interview with a destination', () => {
    const engine = new ProactiveTaskAssistantEngine(new DynamicPackingListEngine(), new ContextTimelineEngine(), new ContextualNotificationEngine());
    const result = engine.evaluate({
      userId: 'user',
      context: context({
        title: 'Job interview',
        text: 'job interview cv laptop charger',
        primaryContext: 'interview',
        secondaryContexts: [],
        travelRequired: true,
      }),
      preferences,
      scheduleVersion: 'v1',
    });
    expect(result.packingNeeds.map((item) => item.type)).not.toEqual(expect.arrayContaining(['packing_clothes', 'packing_medication', 'packing_passport']));
    expect(result.timelineStages.map((stage) => stage.title)).not.toContain('Complete a final document and luggage check');
    expect(result.packingNeeds.map((item) => item.type)).toContain('packing_charger');
  });
});
