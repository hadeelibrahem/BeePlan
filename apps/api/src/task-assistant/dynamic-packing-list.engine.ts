import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import type {
  AssistantPriority,
  ClassifiedTaskContext,
  PackingCategory,
  PreparationSuggestion,
  TaskAssistantPreferences,
} from './task-assistant.types';

export type PackingEvidence = {
  tripDays?: number | null;
  cold?: boolean;
  rain?: boolean;
  adapterVerified?: boolean;
};

type PackingRule = {
  type: string;
  title: string;
  category: PackingCategory;
  priority: AssistantPriority;
  contexts: string[];
  reason: string;
  evidenceType?: PreparationSuggestion['evidenceType'];
  when?: (context: ClassifiedTaskContext) => boolean;
};

const RULES: PackingRule[] = [
  {
    type: 'packing_charger',
    title: 'Charger',
    category: 'electronics',
    priority: 'medium',
    contexts: ['travel', 'flight', 'university'],
    reason: 'The task mentions a device or charger that should be available.',
    evidenceType: 'text_evidence',
    when: (context) => /\b(laptop|charger|camera|tablet|phone)\b/i.test(context.text),
  },
  {
    type: 'packing_medication',
    title: 'Regular medication',
    category: 'health',
    priority: 'high',
    contexts: ['travel', 'flight', 'medical'],
    reason: 'Keep user-provided regular medication available.',
  },
  {
    type: 'packing_passport',
    title: 'Passport',
    category: 'documents',
    priority: 'high',
    contexts: ['travel', 'flight'],
    reason:
      'International travel preparation includes checking travel documents.',
  },
];

@Injectable()
export class DynamicPackingListEngine {
  generate(
    context: ClassifiedTaskContext,
    preferences: TaskAssistantPreferences,
    facts: PackingEvidence = {},
    excludedTypes = new Set<string>(),
  ): (PreparationSuggestion & { fingerprint: string })[] {
    if (
      !preferences.enabled ||
      !preferences.proactiveAssistanceEnabled ||
      !preferences.dynamicPackingEnabled ||
      ['low', 'unavailable'].includes(context.confidence)
    )
      return [];
    const contexts = new Set([
      context.primaryContext,
      ...context.secondaryContexts,
    ]);
    const output = RULES.filter(
      (rule) =>
        (rule.contexts.some((value) => contexts.has(value as never)) || rule.when?.(context)) &&
        !excludedTypes.has(rule.type) &&
        (preferences.travelAdviceEnabled !== false ||
          !rule.contexts.some((value) => ['travel', 'flight'].includes(value))),
    )
      .filter(
        (rule) => rule.type !== 'packing_passport' || isInternational(context),
      )
      .filter(
        (rule) =>
          rule.type !== 'packing_medication' ||
          preferences.medicationAdviceEnabled !== false,
      )
      .filter(
        (rule) =>
          rule.type !== 'packing_charger' ||
          preferences.electronicsAdviceEnabled !== false,
      )
      .map((rule) => item(context.taskId, rule, null));
    if (
      facts.tripDays &&
      preferences.travelAdviceEnabled !== false &&
      preferences.clothingAdviceEnabled !== false &&
      !excludedTypes.has('packing_clothes')
    )
      output.push(
        item(
          context.taskId,
          {
            type: 'packing_clothes',
            title: `Clothes for about ${facts.tripDays} days`,
            category: 'clothing',
            priority: 'medium',
            contexts: [],
            reason: `The trip duration is ${facts.tripDays} days.`,
          },
          `about ${facts.tripDays}`,
        ),
      );
    else if (
      preferences.travelAdviceEnabled !== false &&
      preferences.clothingAdviceEnabled !== false &&
      ['travel', 'flight'].some((value) => contexts.has(value as never)) &&
      !excludedTypes.has('packing_clothes')
    )
      output.push(
        item(
          context.taskId,
          {
            type: 'packing_clothes',
            title: 'Enough clothes for the trip',
            category: 'clothing',
            priority: 'medium',
            contexts: [],
            reason:
              'Trip duration is not available, so no exact quantity is claimed.',
          },
          null,
        ),
      );
    if (
      facts.cold &&
      preferences.weatherAdviceEnabled !== false &&
      preferences.clothingAdviceEnabled !== false &&
      !excludedTypes.has('packing_warm_layers')
    )
      output.push(
        item(
          context.taskId,
          {
            type: 'packing_warm_layers',
            title: 'Warm layers',
            category: 'clothing',
            priority: 'medium',
            contexts: [],
            reason: 'Verified destination weather indicates cold conditions.',
          },
          null,
        ),
      );
    if (
      facts.rain &&
      preferences.weatherAdviceEnabled !== false &&
      preferences.umbrellaAdviceEnabled &&
      !excludedTypes.has('packing_rain_protection')
    )
      output.push(
        item(
          context.taskId,
          {
            type: 'packing_rain_protection',
            title: 'Rain protection',
            category: 'weather_protection',
            priority: 'medium',
            contexts: [],
            reason: 'Verified destination weather indicates rain.',
          },
          null,
        ),
      );
    if (facts.adapterVerified && !excludedTypes.has('packing_adapter'))
      output.push(
        item(
          context.taskId,
          {
            type: 'packing_adapter',
            title: 'Verified suitable power adapter',
            category: 'electronics',
            priority: 'medium',
            contexts: [],
            reason:
              'Adapter compatibility was verified from structured destination data.',
          },
          null,
        ),
      );
    return [...new Map(output.map((value) => [value.type, value])).values()];
  }
}

function item(
  taskId: string,
  rule: PackingRule,
  quantity: string | null,
): PreparationSuggestion & { fingerprint: string } {
  return {
    type: rule.type,
    title: rule.title,
    description: rule.title,
    reason: rule.reason,
    evidence: {},
    evidenceType: rule.evidenceType ?? (rule.reason.startsWith('Verified') ? 'verified_fact' : 'general_preparation'),
    category: rule.category,
    priority: rule.priority,
    quantity,
    notificationEligible: rule.priority === 'high',
    fingerprint: createHash('sha256')
      .update(`${taskId}|${rule.type}`)
      .digest('hex'),
  };
}
function isInternational(context: ClassifiedTaskContext) {
  return Boolean(
    context.destination &&
    /\b(canada|usa|united states|uk|france|germany|italy|spain|turkey|jordan|egypt|uae|qatar|saudi|international)\b/i.test(
      `${context.destination.displayName} ${context.text}`,
    ),
  );
}
