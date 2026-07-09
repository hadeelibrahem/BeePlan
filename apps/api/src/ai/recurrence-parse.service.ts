import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type { ParseRecurrenceDto } from './dto/parse-recurrence.dto';
import { buildRecurrenceParsePrompt } from './prompts/recurrence-parse.prompt';
import {
  type AiRecurrenceParseResponse,
  normalizeAiRecurrenceResponse,
  parseRecurrenceWithRules,
} from './recurrence-parser';
import { parseJsonResponse } from './utils/json-response';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_OPENROUTER_MODEL = 'openai/gpt-4o-mini';
const PROVIDER_TIMEOUT_MS = 20_000;

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
              content: buildRecurrenceParsePrompt(dto.currentDate, dto.timezone),
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

  private toResponse(raw: string, currentDate: string): AiRecurrenceParseResponse {
    const parsed = parseJsonResponse(raw);
    return normalizeAiRecurrenceResponse(parsed, currentDate);
  }
}
