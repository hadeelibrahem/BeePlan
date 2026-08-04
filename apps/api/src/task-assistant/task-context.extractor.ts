import { Injectable } from '@nestjs/common';
import type {
  ExtractedTaskContext,
  TaskContextInput,
} from './task-assistant.types';

@Injectable()
export class TaskContextExtractor {
  extract(input: TaskContextInput): ExtractedTaskContext {
    const text = [
      input.title,
      input.description,
      input.category,
      ...(input.labels ?? []),
      ...(input.subtasks ?? []).flatMap((item) => [
        item.title,
        item.description,
      ]),
      ...(input.attachments ?? []).map((item) => item.fileName ?? item.name),
    ]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase();
    const scheduledExecution =
      input.scheduledDate && input.scheduledStartTime
        ? `${input.scheduledDate}T${input.scheduledStartTime}:00`
        : null;
    const travelRequired = Boolean(input.destination);
    return {
      ...input,
      text,
      scheduledExecution,
      deadline: input.dueDate ? new Date(input.dueDate).toISOString() : null,
      travelRequired,
      likelyDocuments: keywordItems(text, [
        ['passport', 'passport'],
        ['visa', 'entry documents'],
        ['cv', 'CV'],
        ['resume', 'CV'],
        ['prescription', 'prescription'],
      ]),
      likelyEquipment: keywordItems(text, [
        ['laptop', 'laptop'],
        ['charger', 'charger'],
        ['camera', 'camera'],
      ]),
      likelyClothingNeeds: [],
      externalFactsRequired: [
        travelRequired ? 'route' : null,
        travelRequired ? 'forecast' : null,
      ].filter((v): v is string => Boolean(v)),
      assumptions: [],
    };
  }
}

function keywordItems(text: string, entries: [string, string][]) {
  return [
    ...new Set(
      entries
        .filter(([keyword]) => text.includes(keyword))
        .map(([, item]) => item),
    ),
  ];
}
