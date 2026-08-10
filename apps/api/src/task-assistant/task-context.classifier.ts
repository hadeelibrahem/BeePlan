import { Injectable } from '@nestjs/common';
import type {
  ClassifiedTaskContext,
  ExtractedTaskContext,
  TaskContextType,
} from './task-assistant.types';

const RULES: Record<Exclude<TaskContextType, 'general'>, RegExp> = {
  travel: /\b(travel|trip|tour|vacation|hotel|conference abroad)\b/i,
  flight: /\b(flight|airport|boarding|airline|fly to)\b/i,
  university: /\b(university|college|lecture|campus|student id)\b/i,
  school: /\b(school|classroom|teacher|homework)\b/i,
  work: /\b(work|office|conference|client|presentation)\b/i,
  interview: /\b(interview|recruiter|hiring|candidate)\b/i,
  meeting: /\b(meeting|meet with|appointment with)\b/i,
  online_meeting:
    /\b(zoom|teams meeting|google meet|online meeting|video call|meeting link)\b/i,
  medical: /\b(doctor|hospital|clinic|medical|dentist|therapy)\b/i,
  pharmacy: /\b(pharmacy|prescription|medicine|medication|drugstore)\b/i,
  shopping: /\b(shop|shopping|buy|groceries|store)\b/i,
  exercise: /\b(workout|exercise|gym|run|running|training)\b/i,
  outdoor_activity: /\b(hike|hiking|picnic|outdoor|camping|beach)\b/i,
  appointment: /\b(appointment|reservation|booking)\b/i,
  document_submission:
    /\b(submit|submission|application|file documents|paperwork)\b/i,
  bill_payment:
    /\b(pay bill|payment due|invoice|electricity bill|water bill)\b/i,
};

@Injectable()
export class TaskContextClassifier {
  classify(input: ExtractedTaskContext): ClassifiedTaskContext {
    if (input.correctedContext)
      return {
        ...input,
        primaryContext: input.correctedContext,
        secondaryContexts: [],
        confidence: 'high',
        confidenceReason: 'Task type was selected by the user.',
      };
    const matches = (
      Object.entries(RULES) as [Exclude<TaskContextType, 'general'>, RegExp][]
    )
      .filter(([, rule]) => rule.test(input.text))
      .map(([context]) => context);
    const primaryContext = choosePrimary(matches);
    if (primaryContext === 'general')
      return {
        ...input,
        primaryContext,
        secondaryContexts: [],
        confidence: 'unavailable',
        confidenceReason: 'BeePlan is not sure what preparation applies.',
      };
    const explicit = RULES[primaryContext].test(input.title);
    return {
      ...input,
      primaryContext,
      secondaryContexts: matches.filter((value) => value !== primaryContext),
      confidence: explicit ? 'high' : 'medium',
      confidenceReason: explicit
        ? 'The task title clearly identifies this context.'
        : 'The task details and destination support this context.',
    };
  }
}

function choosePrimary(matches: TaskContextType[]): TaskContextType {
  const priority: TaskContextType[] = [
    'flight',
    'interview',
    'online_meeting',
    'medical',
    'pharmacy',
    'university',
    'school',
    'document_submission',
    'bill_payment',
    'meeting',
    'exercise',
    'outdoor_activity',
    'shopping',
    'travel',
    'appointment',
    'work',
  ];
  return priority.find((value) => matches.includes(value)) ?? 'general';
}
