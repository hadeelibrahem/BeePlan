import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { buildReminderParsePrompt } from './prompts/reminder-parse.prompt';
import { normalizeReminderDraft, ReminderDraft } from './reminder-draft';
import { parseJsonResponse } from './utils/json-response';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly client: OpenAI | null;
  private readonly model: string | null;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('QWEN_API_KEY');
    const baseURL = this.configService.get<string>('QWEN_BASE_URL');
    const model = this.configService.get<string>('QWEN_MODEL');
    this.client = apiKey && baseURL ? new OpenAI({ apiKey, baseURL }) : null;
    this.model = model ?? null;
  }

  async parseReminder(text: string): Promise<ReminderDraft> {
    if (!this.client || !this.model) {
      throw new InternalServerErrorException('AI reminder parsing is not configured.');
    }

    const trimmed = text.trim();
    if (!trimmed) {
      throw new BadRequestException('text must not be empty.');
    }

    let raw: string;
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: buildReminderParsePrompt() },
          { role: 'user', content: trimmed },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
      });
      raw = response.choices[0]?.message?.content ?? '';
    } catch (error) {
      this.logger.error(
        `Qwen request failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      throw new InternalServerErrorException('Failed to parse reminder with AI.');
    }

    return this.toDraft(raw);
  }

  private toDraft(raw: string): ReminderDraft {
    let parsed: unknown;
    try {
      parsed = parseJsonResponse(raw);
    } catch {
      this.logger.error('Qwen returned a response that was not valid JSON.');
      throw new InternalServerErrorException('AI returned an invalid response.');
    }

    return normalizeReminderDraft(parsed);
  }
}
