import { Injectable } from '@nestjs/common';
import type {
  ClassifiedTaskContext,
  PreparationSuggestion,
} from './task-assistant.types';

@Injectable()
export class TaskContextValidationService {
  validate(
    context: ClassifiedTaskContext,
    suggestions: PreparationSuggestion[],
  ) {
    if (context.confidence === 'unavailable') return [];
    return suggestions.filter(
      (suggestion, index, all) =>
        suggestion.title.trim().length > 0 &&
        suggestion.reason.trim().length > 0 &&
        all.findIndex((candidate) => candidate.type === suggestion.type) ===
          index &&
        !assertsUnverifiedVisa(suggestion),
    );
  }
}
function assertsUnverifiedVisa(suggestion: PreparationSuggestion) {
  return (
    /\b(you need|visa is required|must obtain)\b/i.test(
      `${suggestion.title} ${suggestion.description}`,
    ) && !suggestion.evidence.verifiedSource
  );
}
