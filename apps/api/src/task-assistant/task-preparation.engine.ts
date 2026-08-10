import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import type {
  ClassifiedTaskContext,
  PreparationSuggestion,
  TaskAssistantPreferences,
  TaskContextType,
} from './task-assistant.types';

type Rule = {
  contexts: TaskContextType[];
  type: string;
  title: string;
  description: string;
  reason: string;
  evidenceType?: PreparationSuggestion['evidenceType'];
  when?: (context: ClassifiedTaskContext) => boolean;
};
const RULES: Rule[] = [
  {
    contexts: ['travel', 'flight'],
    type: 'passport_check',
    title: 'Check passport validity',
    description: 'Confirm that your passport is valid for the planned trip.',
    reason: 'This task appears to involve international travel.',
    when: internationalTravel,
  },
  {
    contexts: ['travel', 'flight'],
    type: 'entry_requirements_check',
    title: 'Check current entry requirements',
    description:
      'Review current official entry requirements for the destination before travel.',
    reason: 'Entry rules can change and require authoritative verification.',
    when: internationalTravel,
  },
  {
    contexts: ['flight'],
    type: 'booking_documents',
    title: 'Save booking details',
    description:
      'Keep tickets, booking confirmation, and accommodation details available.',
    reason: 'This task appears to involve a flight.',
  },
  {
    contexts: ['travel', 'flight'],
    type: 'charger_adapter',
    title: 'Pack charger and suitable adapter',
    description:
      'Prepare device chargers and check whether a destination adapter is appropriate.',
    reason: 'This task appears to involve travel.',
    when: internationalTravel,
  },
  {
    contexts: ['interview'],
    type: 'cv',
    title: 'Prepare your CV',
    description: 'Keep an up-to-date CV ready for the interview.',
    reason: 'This task was classified as an interview.',
  },
  {
    contexts: ['interview'],
    type: 'interview_details',
    title: 'Confirm interview details',
    description: 'Confirm the location or meeting link before the interview.',
    reason: 'The interview location or link should be ready before it starts.',
  },
  {
    contexts: ['university', 'school'],
    type: 'laptop_charger',
    title: 'Bring laptop and charger',
    description: 'Prepare the devices needed for class.',
    reason: 'This task appears to involve study or a lecture.',
  },
  {
    contexts: ['university', 'school'],
    type: 'study_materials',
    title: 'Prepare study materials',
    description:
      'Bring a notebook, required books, and relevant assignment files.',
    reason: 'This task appears to involve study or a lecture.',
  },
  {
    contexts: ['medical'],
    type: 'medical_documents',
    title: 'Prepare appointment documents',
    description:
      'Bring identification, appointment confirmation, and relevant medical records.',
    reason: 'This task appears to be a medical appointment.',
  },
  {
    contexts: ['pharmacy'],
    type: 'prescription',
    title: 'Bring your prescription details',
    description: 'Keep the prescription or medication name ready.',
    reason: 'This task appears to be a pharmacy visit.',
  },
  {
    contexts: ['online_meeting'],
    type: 'meeting_link',
    title: 'Confirm the meeting link',
    description: 'Open or save the verified meeting link before the call.',
    reason: 'This task was classified as an online meeting.',
  },
  {
    contexts: ['online_meeting'],
    type: 'call_equipment',
    title: 'Check call equipment',
    description:
      'Check internet, microphone, camera, charger, and a quiet location.',
    reason: 'These are practical preparations for an online meeting.',
  },
  {
    contexts: ['exercise', 'outdoor_activity'],
    type: 'exercise_gear',
    title: 'Prepare water and suitable gear',
    description:
      'Bring water, suitable clothing, shoes, and any required equipment.',
    reason: 'This task appears to involve exercise.',
    when: (context) =>
      /outdoor|run|hike|gym|exercise|workout/i.test(context.text),
  },
];

@Injectable()
export class TaskPreparationEngine {
  generate(
    context: ClassifiedTaskContext,
    preferences: TaskAssistantPreferences,
  ): (PreparationSuggestion & { fingerprint: string })[] {
    if (
      !preferences.enabled ||
      !preferences.preparationChecklistsEnabled ||
      preferences.dynamicPreparationEnabled === false ||
      context.confidence === 'unavailable'
    )
      return [];
    const contexts = new Set([
      context.primaryContext,
      ...context.secondaryContexts,
    ]);
    return RULES.filter(
      (rule) =>
        rule.contexts.some((value) => contexts.has(value)) &&
        (!rule.when || rule.when(context)),
    )
      .filter(
        (rule) =>
          preferences.documentAdviceEnabled ||
          ![
            'passport_check',
            'entry_requirements_check',
            'cv',
            'medical_documents',
            'prescription',
            'booking_documents',
            'interview_details',
            'meeting_link',
          ].includes(rule.type),
      )
      .filter(
        (rule) =>
          preferences.electronicsAdviceEnabled !== false ||
          !['charger_adapter', 'laptop_charger', 'call_equipment'].includes(
            rule.type,
          ),
      )
      .filter(
        (rule) =>
          preferences.medicationAdviceEnabled !== false ||
          !['medical_documents', 'prescription'].includes(rule.type),
      )
      .filter((rule) =>
        preferences.travelAdviceEnabled !== false ||
        !rule.contexts.some((value) => ['travel', 'flight'].includes(value)),
      )
      .map((rule) => ({
        type: rule.type,
        title: rule.title,
        description: rule.description,
        reason: rule.reason,
        evidence: {
          contexts: [...contexts],
          destination: context.destination?.displayName ?? null,
        },
        evidenceType: rule.evidenceType ?? 'general_preparation',
        dueAt: null,
        notificationAt: null,
        fingerprint: fingerprint(context.taskId, rule.type, rule.title),
      }));
  }
}

function internationalTravel(context: ClassifiedTaskContext) {
  if (!context.destination) return false;
  return /\b(canada|usa|united states|uk|united kingdom|france|germany|italy|spain|turkey|jordan|egypt|uae|dubai|qatar|saudi|airport|international)\b/i.test(
    `${context.destination.displayName} ${context.destination.address ?? ''} ${context.text}`,
  );
}
function fingerprint(taskId: string, type: string, title: string) {
  return createHash('sha256')
    .update(`${taskId}|${type}|${title}`)
    .digest('hex');
}
