import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { normalizeReminderDraft, ReminderDraft } from './reminder-draft';

const RESPONSE_SCHEMA = `{
  "title": "",
  "description": "",
  "reminderType": "time" | "location" | "context" | "checklist",
  "priority": "low" | "medium" | "high",
  "time": {
    "date": "",
    "time": "",
    "repeat": "none" | "daily" | "weekly" | "monthly"
  },
  "location": {
    "mode": "none" | "specific" | "general",
    "name": "",
    "address": "",
    "category": "",
    "trigger": "arrive" | "leave",
    "radius": 100
  },
  "context": {
    "condition": ""
  },
  "checklist": []
}`;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('QWEN_API_KEY');
    const baseURL = this.configService.get<string>('QWEN_BASE_URL');
    const model = this.configService.get<string>('QWEN_MODEL');
    if (!apiKey) {
      throw new Error('QWEN_API_KEY is not configured');
    }
    if (!baseURL) {
      throw new Error('QWEN_BASE_URL is not configured');
    }
    if (!model) {
      throw new Error('QWEN_MODEL is not configured');
    }
    this.client = new OpenAI({ apiKey, baseURL });
    this.model = model;
  }

  async parseReminder(text: string): Promise<ReminderDraft> {
    const trimmed = text.trim();
    if (!trimmed) {
      throw new BadRequestException('text must not be empty.');
    }

    let raw: string;
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: this.buildSystemInstruction() },
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

  private buildSystemInstruction(): string {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);

    const dayAfterTomorrow = new Date(today);
    dayAfterTomorrow.setUTCDate(dayAfterTomorrow.getUTCDate() + 2);
    const dayAfterTomorrowStr = dayAfterTomorrow.toISOString().slice(0, 10);

    return [
      "You are BeePlan's reminder parsing assistant.",
      'You receive a short user message describing a reminder they want to set.',
      'The message may be in Arabic, English, or a mix of both.',
      `Today's date is ${todayStr} (YYYY-MM-DD).`,
      'Always resolve relative dates against this exact server date. Use these exact values, do not compute them yourself:',
      `- "اليوم" / "today" = ${todayStr}`,
      `- "بكرة" / "بكره" / "غدا" / "غداً" / "tomorrow" = ${tomorrowStr}`,
      `- "بعد بكرة" / "بعد بكره" / "بعد غد" / "day after tomorrow" = ${dayAfterTomorrowStr}`,
      'Preserve important English words as written, including project names, medicine names, course names, place names, and people names.',
      'If the user mentions a date or time, fill the "time" fields. Use ISO format "YYYY-MM-DD" for date and 24-hour "HH:mm" for time.',
      'Never guess or infer AM/PM. Only convert to a 24-hour hour when the user states or clearly implies it (e.g. "مساء"/"evening"/"PM" means afternoon/evening, "صباح"/"morning"/"AM" means morning). If AM/PM is not stated or implied, use the literal hour the user said as-is.',
      'Set "time.repeat" to "none" by default. Only set it to something else if the user explicitly states repetition:',
      '- "daily" only if the user says "daily", "كل يوم", "يوميا", or "يوميًا"',
      '- "weekly" only if the user says "weekly", "كل أسبوع", "أسبوعيا", or "أسبوعيًا"',
      '- "monthly" only if the user says "monthly", "كل شهر", "شهريا", or "شهريًا"',
      'Never infer repetition just because a specific date or time was mentioned. A one-time reminder always has "repeat": "none".',
      'If the user describes an arrive/leave place trigger, set "reminderType" to "location" and fill the "location" fields. This takes priority over "time" or "context" even if a time or condition is also mentioned.',
      'Recognize these trigger phrases (Arabic and English) and map them to "location.trigger":',
      '- "arrive": "لما أوصل", "لما أكون عند", "لما أكون في", "when I arrive", "when I reach", "when I get to"',
      '- "leave": "لما أروح", "لما أطلع", "لما أغادر", "when I leave"',
      'For a general place type (not a specific named place), set "location.mode" to "general" and "location.category" to exactly one of these English words based on what the user said: home, work, university, school, gym, pharmacy, hospital, airport, bank, atm, parking, gas_station, mosque, library, grocery_store, coffee_shop, restaurant. Examples: "الجامعة"/"university" → "university"; "البيت"/"home" → "home"; "الشغل"/"work" → "work"; "المدرسة"/"school" → "school"; "الصيدلية"/"pharmacy" → "pharmacy"; "المستشفى"/"hospital" → "hospital"; "الجيم"/"gym" → "gym"; "السوبرماركت"/"grocery store" → "grocery_store".',
      'For a specific named or branded place (a particular business, landmark, or place with its own name — e.g. "An-Najah University", "صيدلية الشفاء", "Starbucks", "مطعم الرومانسية"), set "location.mode" to "specific" and put the extracted place name in "location.name" exactly as the user said it, preserving the original language. This applies even if the name also contains a category word: a name attached to a category (like "صيدلية الشفاء" = "Al-Shifa Pharmacy") is still specific, not general. Leave "location.address" empty unless the user stated a real address. Never invent or guess a place name, address, or coordinates that were not stated — this schema has no coordinate fields, so never put coordinates anywhere.',
      'If the user lists multiple items or tasks, set "reminderType" to "checklist" and put each item as a string in the "checklist" array.',
      'If a piece of information is unclear or not mentioned, leave that field as an empty string, empty array, or "none" instead of guessing. Never invent a value that is not stated or clearly implied by the user.',
      'Respond with exactly one valid JSON object and nothing else: no markdown, no code fences, no explanations.',
      'The JSON object must match this exact shape (types shown, not literal values):',
      RESPONSE_SCHEMA,
    ].join('\n');
  }

  private toDraft(raw: string): ReminderDraft {
    const cleaned = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/, '')
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      this.logger.error('Qwen returned a response that was not valid JSON.');
      throw new InternalServerErrorException('AI returned an invalid response.');
    }

    return normalizeReminderDraft(parsed);
  }
}
