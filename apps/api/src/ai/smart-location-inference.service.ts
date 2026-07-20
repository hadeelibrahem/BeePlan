import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { buildSmartLocationInferencePrompt } from './prompts/smart-location-inference.prompt';
import {
  normalizeSmartPlaceCategory,
  type SmartPlaceCategory,
} from './smart-place-categories';
import { parseJsonResponse } from './utils/json-response';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_OPENROUTER_MODEL = 'openai/gpt-4o-mini';

export type SmartLocationInferenceSource = 'ai' | 'rules';

export type SmartLocationInferenceResult = {
  title: string;
  category: SmartPlaceCategory | null;
  confidence: number;
  reason: string;
  source: SmartLocationInferenceSource;
};

type KeywordRule = {
  category: SmartPlaceCategory;
  keywords: string[];
  reason: string;
};

const FALLBACK_RULES: KeywordRule[] = [
  {
    category: 'pharmacy',
    keywords: ['medicine', 'prescription', 'pills', 'pharmacy', 'drugstore', 'vitamin', 'antibiotic'],
    reason: 'This reminder is about medicine or prescriptions.',
  },
  {
    category: 'supermarket',
    keywords: ['groceries', 'grocery', 'shopping', 'milk', 'eggs', 'vegetables', 'fruit', 'supermarket'],
    reason: 'This reminder is about buying groceries or household food.',
  },
  {
    category: 'cafe',
    keywords: ['coffee', 'espresso', 'latte', 'cappuccino'],
    reason: 'This reminder mentions coffee.',
  },
  {
    category: 'restaurant',
    keywords: ['lunch', 'dinner', 'breakfast', 'meal', 'restaurant', 'eat', 'food', 'meet for lunch'],
    reason: 'This reminder sounds tied to eating out.',
  },
  {
    category: 'atm',
    keywords: ['cash', 'withdraw', 'atm'],
    reason: 'This reminder is about withdrawing cash.',
  },
  {
    category: 'bank',
    keywords: ['deposit', 'bank', 'transfer money', 'loan', 'account'],
    reason: 'This reminder is about banking.',
  },
  {
    category: 'gas_station',
    keywords: ['fuel', 'gas', 'petrol', 'fill the car', 'fill up', 'diesel'],
    reason: 'This reminder is about fueling a vehicle.',
  },
  {
    category: 'bakery',
    keywords: ['bread', 'bakery', 'cake', 'pastry', 'croissant'],
    reason: 'This reminder mentions baked goods.',
  },
  {
    category: 'gym',
    keywords: ['gym', 'workout', 'exercise', 'fitness', 'training'],
    reason: 'This reminder is about fitness.',
  },
  {
    category: 'library',
    keywords: ['borrow a book', 'return book', 'library'],
    reason: 'This reminder is about a library task.',
  },
  {
    category: 'bookstore',
    keywords: ['buy book', 'bookstore', 'book shop'],
    reason: 'This reminder is about buying books.',
  },
  {
    category: 'electronics_store',
    keywords: ['charger', 'laptop charger', 'phone charger', 'electronics', 'headphones', 'cable'],
    reason: 'This reminder is about electronics or accessories.',
  },
  {
    category: 'hardware_store',
    keywords: ['screw', 'nail', 'hammer', 'paint', 'hardware', 'tools'],
    reason: 'This reminder is about hardware supplies.',
  },
  {
    category: 'pet_store',
    keywords: ['pet food', 'dog food', 'cat food', 'pet store', 'litter'],
    reason: 'This reminder is about pet supplies.',
  },
  {
    category: 'laundry',
    keywords: ['laundry', 'dry clean', 'dry-clean', 'cleaners'],
    reason: 'This reminder is about laundry or dry cleaning.',
  },
  {
    category: 'post_office',
    keywords: ['mail package', 'send package', 'post office', 'parcel', 'stamp'],
    reason: 'This reminder is about mail or packages.',
  },
  {
    category: 'clinic',
    keywords: ['clinic', 'doctor appointment', 'checkup', 'dentist'],
    reason: 'This reminder is about a clinic visit.',
  },
  {
    category: 'hospital',
    keywords: ['hospital', 'emergency room'],
    reason: 'This reminder mentions a hospital.',
  },
  {
    category: 'school',
    keywords: ['school', 'classroom', 'teacher'],
    reason: 'This reminder is related to school.',
  },
  {
    category: 'university',
    keywords: ['university', 'campus', 'lecture', 'professor'],
    reason: 'This reminder is related to university.',
  },
  {
    category: 'shopping_mall',
    keywords: ['mall', 'shopping mall'],
    reason: 'This reminder mentions a shopping mall.',
  },
  {
    category: 'airport',
    keywords: ['airport', 'flight', 'boarding'],
    reason: 'This reminder is related to air travel.',
  },
  {
    category: 'train_station',
    keywords: ['train station', 'catch train'],
    reason: 'This reminder is related to train travel.',
  },
  {
    category: 'bus_station',
    keywords: ['bus station', 'catch bus'],
    reason: 'This reminder is related to bus travel.',
  },
];

export function inferSmartLocationWithRules(
  text: string,
): SmartLocationInferenceResult {
  const normalizedText = text.toLowerCase();
  const match = FALLBACK_RULES.find((rule) =>
    rule.keywords.some((keyword) => normalizedText.includes(keyword)),
  );

  if (!match) {
    return {
      title: text,
      category: null,
      confidence: 0,
      reason: 'No clear place category was detected.',
      source: 'rules',
    };
  }

  return {
    title: text,
    category: match.category,
    confidence: 0.82,
    reason: match.reason,
    source: 'rules',
  };
}

@Injectable()
export class SmartLocationInferenceService {
  private readonly logger = new Logger(SmartLocationInferenceService.name);
  private readonly client: OpenAI | null;
  private readonly model: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENROUTER_API_KEY');
    const baseURL =
      this.configService.get<string>('OPENROUTER_BASE_URL') ??
      OPENROUTER_BASE_URL;
    this.model =
      this.configService.get<string>('OPENROUTER_MODEL') ??
      DEFAULT_OPENROUTER_MODEL;
    this.client = apiKey ? new OpenAI({ apiKey, baseURL }) : null;
  }

  async infer(text: string): Promise<SmartLocationInferenceResult> {
    const trimmed = text.trim();
    if (!trimmed) {
      throw new BadRequestException('text must not be empty.');
    }

    if (!this.client) {
      return this.inferWithRules(trimmed);
    }

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: buildSmartLocationInferencePrompt() },
          { role: 'user', content: trimmed },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      });
      const raw = response.choices[0]?.message?.content ?? '';
      const parsed = parseJsonResponse(raw);
      const normalized = this.normalizeAiResult(parsed, trimmed);
      if (normalized.category && normalized.confidence >= 0.35) {
        return { ...normalized, source: 'ai' };
      }
    } catch (error) {
      this.logger.warn(
        `OpenRouter smart-location inference failed; using rules fallback: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }

    return this.inferWithRules(trimmed);
  }

  inferWithRules(text: string): SmartLocationInferenceResult {
    return inferSmartLocationWithRules(text);
  }

  private normalizeAiResult(
    input: unknown,
    fallbackTitle: string,
  ): Omit<SmartLocationInferenceResult, 'source'> {
    const record =
      input && typeof input === 'object'
        ? (input as Record<string, unknown>)
        : {};
    const category = normalizeSmartPlaceCategory(record.category);
    const confidence =
      typeof record.confidence === 'number' && Number.isFinite(record.confidence)
        ? Math.max(0, Math.min(1, record.confidence))
        : category
          ? 0.7
          : 0;

    return {
      title: typeof record.title === 'string' && record.title.trim()
        ? record.title.trim()
        : fallbackTitle,
      category,
      confidence,
      reason:
        typeof record.reason === 'string' && record.reason.trim()
          ? record.reason.trim()
          : category
            ? `This reminder appears related to ${category.replaceAll('_', ' ')}.`
            : 'No clear place category was detected.',
    };
  }
}
