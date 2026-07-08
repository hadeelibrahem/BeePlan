import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type { ParseRecurrenceDto } from './dto/parse-recurrence.dto';
import {
  type AiRecurrenceParseResponse,
  normalizeAiRecurrenceResponse,
  parseRecurrenceWithRules,
} from './recurrence-parser';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_OPENROUTER_MODEL = 'openai/gpt-4o-mini';
const PROVIDER_TIMEOUT_MS = 20_000;

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

@Injectable()
export class RecurrenceParseService {
  private readonly logger = new Logger(RecurrenceParseService.name);
  private readonly client: OpenAI | null;
  private readonly model: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENROUTER_API_KEY');
    const baseURL =
      this.configService.get<string>('OPENROUTER_BASE_URL') ?? OPENROUTER_BASE_URL;
    this.model =
      this.configService.get<string>('OPENROUTER_MODEL') ?? DEFAULT_OPENROUTER_MODEL;
    this.client = apiKey
      ? new OpenAI({
          apiKey,
          baseURL,
          defaultHeaders: {
            'HTTP-Referer': 'https://beeplan.local',
            'X-Title': 'BeePlan',
          },
        })
      : null;
  }

  async parse(dto: ParseRecurrenceDto): Promise<AiRecurrenceParseResponse> {
    const message = dto.message.trim();
    if (!message) {
      throw new BadRequestException('message must not be empty.');
    }

    if (!this.client) {
      return parseRecurrenceWithRules(message, dto.currentDate);
    }

    try {
      const response = await this.client.chat.completions.create(
        {
          model: this.model,
          messages: [
            {
              role: 'system',
              content: this.buildSystemInstruction(dto.currentDate, dto.timezone),
            },
            { role: 'user', content: message },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1,
        },
        { timeout: PROVIDER_TIMEOUT_MS },
      );

      const raw = response.choices[0]?.message?.content ?? '';
      return this.toResponse(raw, dto.currentDate);
    } catch (error) {
      this.logger.warn(
        `OpenRouter recurrence parse failed; using rules fallback: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      return parseRecurrenceWithRules(message, dto.currentDate);
    }
  }

  private buildSystemInstruction(currentDate: string, timezone: string) {
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

  private toResponse(raw: string, currentDate: string): AiRecurrenceParseResponse {
    const cleaned = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/, '')
      .trim();

    const parsed = JSON.parse(cleaned) as unknown;
    return normalizeAiRecurrenceResponse(parsed, currentDate);
  }
}
