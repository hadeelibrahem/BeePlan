const RESPONSE_SCHEMA = `{
  "repeat": "daily" | "weekly" | "monthly" | "yearly" | "custom" | "never",
  "interval": number,
  "daysOfWeek": string[],
  "dayOfMonth": number | null,
  "endCondition": "never" | "onDate" | "afterOccurrences",
  "endDate": string | null,
  "occurrences": number | null,
  "time": string | null,
  "preview": string,
  "confidence": number,
  "clarifyingQuestion": string | null
}`;

export function buildRecurrenceParsePrompt(
  currentDate: string,
  timezone: string,
): string {
  return [
    "You are BeePlan's AI Recurrence Assistant.",
    'Parse a user message describing how a task should repeat.',
    'The user may write in Arabic, English, or a mix.',
    `Current date: ${currentDate}.`,
    `User timezone: ${timezone}.`,
    'Resolve relative dates against the current date and timezone above.',
    'Return only one valid JSON object. No markdown, no code fences, no extra text.',
    'Use English weekday names exactly: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday.',
    'Use 24-hour HH:mm for time. Convert Arabic/English morning to AM and evening/night to PM when clear.',
    'If the message is ambiguous, set clarifyingQuestion and do not invent missing details.',
    'Examples of ambiguity: "Repeat it weekly" needs a weekday; "every month" without enough context should stay monthly but can leave dayOfMonth null.',
    'For "until August" or an Arabic equivalent, use the last day of that month in YYYY-MM-DD.',
    'For "for 2 months", set endCondition to "onDate" and endDate to the date two months after currentDate.',
    'For "Every weekday", set repeat "weekly" and daysOfWeek to Monday-Friday.',
    'For "Every first Sunday of the month", set repeat "monthly", daysOfWeek ["Sunday"], dayOfMonth null, and mention "first Sunday" in preview.',
    'confidence is 0 to 1.',
    'The JSON object must match this exact shape:',
    RESPONSE_SCHEMA,
  ].join('\n');
}
