import { Injectable } from '@nestjs/common';
import type {
  ClassifiedTaskContext,
  TaskAssistantPreferences,
} from './task-assistant.types';
import { ContextTimelineEngine } from './context-timeline.engine';
import { ContextualNotificationEngine } from './contextual-notification.engine';
import {
  DynamicPackingListEngine,
  type PackingEvidence,
} from './dynamic-packing-list.engine';

@Injectable()
export class ProactiveTaskAssistantEngine {
  constructor(
    private readonly packing: DynamicPackingListEngine,
    private readonly timeline: ContextTimelineEngine,
    private readonly notifications: ContextualNotificationEngine,
  ) {}
  evaluate(input: {
    userId: string;
    context: ClassifiedTaskContext;
    preferences: TaskAssistantPreferences;
    scheduleVersion: string;
    now?: Date;
    packingEvidence?: PackingEvidence;
    excludedSuggestionTypes?: Set<string>;
    recommendedDeparture?: Date | null;
  }) {
    const now = input.now ?? new Date();
    const packingNeeds = this.packing.generate(
      input.context,
      input.preferences,
      input.packingEvidence,
      input.excludedSuggestionTypes,
    );
    const timelineStages = input.preferences.contextTimelineEnabled
      ? this.timeline.generate(input.context, now, input.recommendedDeparture)
      : [];
    const notifications = this.notifications.generate(
      input.userId,
      input.context.taskId,
      input.scheduleVersion,
      timelineStages,
      input.preferences,
    );
    return {
      context: input.context,
      preparationNeeds: [],
      packingNeeds,
      timelineStages,
      notifications,
      deterministicEvidence: input.packingEvidence ?? {},
      assumptions: input.context.assumptions,
      confidence: input.context.confidence,
      validUntil: new Date(now.getTime() + 24 * 3_600_000),
    };
  }
}
