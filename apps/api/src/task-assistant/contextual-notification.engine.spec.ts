import { ContextualNotificationEngine } from './contextual-notification.engine';
import type { TaskAssistantPreferences } from './task-assistant.types';

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

const stage = {
  stageType: 'departure' as const,
  title: 'Leave now',
  description: 'Leave now',
  scheduledAt: new Date('2030-01-01T09:00:00.000Z'),
  dueAt: new Date('2030-01-01T09:00:00.000Z'),
  priority: 'critical' as const,
  triggerReason: 'departure',
  fingerprint: 'stage-fingerprint',
  status: 'pending' as const,
};

const weather = {
  item: { title: 'class' },
  route: { durationMinutes: 35, fallbackUsed: false },
  recommendedDepartureTime: '2030-01-01T09:00:00.000Z',
  notificationTime: '2030-01-01T08:45:00.000Z',
  deterministicMessage: 'Your class starts at 10:00 AM. Travel takes about 35 minutes. Rain is expected.',
  recommendations: {
    recommendationTypes: ['umbrella', 'rain_protection'],
    weatherEvidence: { precipitationProbabilityPercent: 80 },
  },
};

describe('ContextualNotificationEngine', () => {
  it('generates nothing when the master toggle is disabled', () => {
    const result = new ContextualNotificationEngine().generate(
      'user',
      'task',
      'version',
      [stage],
      { ...preferences, enabled: false },
      weather,
    );
    expect(result).toEqual([]);
  });

  it('merges departure and weather/travel advice into one durable draft', () => {
    const result = new ContextualNotificationEngine().generate(
      'user',
      'task',
      'version',
      [stage],
      preferences,
      weather,
    );
    expect(result).toHaveLength(1);
    expect(result[0].body).toContain('35 minutes');
    expect(result[0].body).toContain('Rain');
    expect(result[0].scheduledAt.toISOString()).toBe('2030-01-01T08:45:00.000Z');
  });

  it('suppresses weather-only advice when weather advice is disabled', () => {
    const result = new ContextualNotificationEngine().generate(
      'user',
      'task',
      'version',
      [],
      { ...preferences, weatherAdviceEnabled: false, travelAdviceEnabled: false },
      { ...weather, route: null, recommendedDepartureTime: null },
    );
    expect(result).toEqual([]);
  });

  it('suppresses departure advice when departure reminders are disabled', () => {
    const result = new ContextualNotificationEngine().generate(
      'user',
      'task',
      'version',
      [stage],
      { ...preferences, departureRemindersEnabled: false, weatherAdviceEnabled: false, travelAdviceEnabled: false },
      { ...weather, route: null, recommendedDepartureTime: null },
    );
    expect(result).toEqual([]);
  });

  it('keeps the same fingerprint for repeated evaluation of the same event', () => {
    const engine = new ContextualNotificationEngine();
    const first = engine.generate('user', 'task', 'version', [stage], preferences, weather);
    const second = engine.generate('user', 'task', 'version', [stage], preferences, weather);
    expect(first[0].fingerprint).toBe(second[0].fingerprint);
  });
});
