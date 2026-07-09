export type RecurrenceSuggestionsPromptItem = {
  id: string;
  taskTitle: string;
  reason: string;
  preview: string;
};

export function buildRecurrenceSuggestionCopyPrompt(
  suggestions: RecurrenceSuggestionsPromptItem[],
) {
  return {
    system:
      'You polish BeePlan recurrence suggestion copy. Return JSON only: {"suggestions":[{"id":string,"reason":string,"preview":string}]}. Keep reason friendly, concise, and truthful. Do not change ids or recurrence details.',
    user: JSON.stringify(suggestions),
  };
}
