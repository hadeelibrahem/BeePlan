import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { FriendsService, FriendSummary } from '../social/friends.service';
import { buildReminderParsePrompt } from './prompts/reminder-parse.prompt';
import { normalizeReminderDraft, ReminderDraft } from './reminder-draft';
import { parseJsonResponse } from './utils/json-response';

export type PersonReminderMatch = {
  status: 'matched' | 'needs_selection' | 'no_match';
  candidates: FriendSummary[];
  confidence: number;
};

export type ParsePersonReminderResult = {
  draft: ReminderDraft;
  triggerType: 'person_nearby';
  isPersonReminder: boolean;
  confidence: number;
  match: PersonReminderMatch;
  // Flat convenience fields for AI-first clients.
  matchedFriendId: string | null;
  matchedFriendName: string | null;
  matchConfidence: number;
  needsSelection: boolean;
};

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly client: OpenAI | null;
  private readonly model: string | null;

  constructor(
    private readonly configService: ConfigService,
    private readonly friendsService: FriendsService,
  ) {
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

  /**
   * Parses a person-based reminder ("remind me to talk to Ahmad when I see
   * him") and matches the extracted name against the user's accepted friends.
   * Only the reminder text is sent to the AI — never any location data. If the
   * name can't be resolved to exactly one friend, returns a `needs_selection`
   * (or `no_match`) state so the client can prompt the user to pick.
   */
  async parsePersonReminder(
    userId: string,
    text: string,
  ): Promise<ParsePersonReminderResult> {
    const draft = await this.parseReminder(text);
    const person = draft.person;

    const friends = await this.friendsService.listFriends(userId);
    const match = this.matchFriend(person.personName, friends);

    const matched =
      match.status === 'matched' ? (match.candidates[0] ?? null) : null;

    return {
      draft,
      triggerType: 'person_nearby',
      isPersonReminder: person.isPersonReminder,
      confidence: person.confidence,
      match,
      matchedFriendId: matched?.userId ?? null,
      matchedFriendName: matched?.fullName ?? null,
      matchConfidence: match.confidence,
      needsSelection: match.status === 'needs_selection',
    };
  }

  /**
   * Fuzzy-matches an extracted person name against the user's friends. Scores
   * each friend on full name, name tokens, and email local-part (nickname and
   * username aren't stored on the user record, so those are approximated by the
   * name/email tokens), tolerating minor typos via edit distance. Resolves to a
   * single confident match when one friend clearly leads; otherwise asks the
   * user to choose (multiple close matches) or reports no match.
   */
  private matchFriend(
    personName: string,
    friends: FriendSummary[],
  ): PersonReminderMatch {
    if (friends.length === 0) {
      return { status: 'no_match', candidates: [], confidence: 0 };
    }

    const name = normalizeName(personName);
    if (!name) {
      // AI found no name — let the user choose from all friends.
      return { status: 'needs_selection', candidates: friends, confidence: 0 };
    }

    const scored = friends
      .map((friend) => ({ friend, score: scoreFriend(name, friend) }))
      .sort((a, b) => b.score - a.score);

    const best = scored[0];
    const second = scored[1];

    // One friend clearly leads (high score, and no near-tie behind it).
    const isConfident =
      best.score >= 0.75 && (!second || best.score - second.score >= 0.15);
    if (isConfident) {
      return {
        status: 'matched',
        candidates: [best.friend],
        confidence: best.score,
      };
    }

    // Several plausible matches — ask which one.
    const plausible = scored.filter((s) => s.score >= 0.4);
    if (plausible.length >= 1) {
      return {
        status: 'needs_selection',
        candidates: plausible.map((s) => s.friend),
        confidence: best.score,
      };
    }

    // The name didn't resemble any friend — treat as not found.
    return { status: 'no_match', candidates: [], confidence: best.score };
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

// --- Fuzzy name matching helpers -------------------------------------------

/** Lowercases, trims, and strips Arabic diacritics + punctuation for matching. */
function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    // Strip combining marks (Latin accents + Arabic harakat).
    .replace(/\p{M}+/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Classic Levenshtein edit distance between two short strings. */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const curr = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[b.length];
}

/** Token-level fuzzy similarity: 1 for exact, scaled down for near-typos. */
function tokenSimilarity(query: string, token: string): number {
  if (!query || !token) return 0;
  if (query === token) return 1;
  if (token.startsWith(query) || query.startsWith(token)) return 0.85;

  const distance = editDistance(query, token);
  const longest = Math.max(query.length, token.length);
  // Only reward small edit distances on reasonably long tokens.
  if (longest >= 4 && distance <= 2) {
    return Math.max(0, 0.8 - distance * 0.2);
  }
  if (longest >= 3 && distance === 1) return 0.65;
  return 0;
}

/**
 * Scores how well an extracted `query` name matches a friend, considering the
 * full name, each name token, and the email local-part. Returns 0..1.
 */
function scoreFriend(query: string, friend: FriendSummary): number {
  const fullName = normalizeName(friend.fullName);
  const emailLocal = normalizeName(friend.email.split('@')[0] ?? '');

  if (fullName === query) return 1;

  const nameTokens = fullName.split(' ').filter(Boolean);
  const emailTokens = emailLocal.split(/[.\-_]+/).filter(Boolean);
  const candidates = [fullName, ...nameTokens, emailLocal, ...emailTokens];

  let best = 0;
  for (const candidate of candidates) {
    best = Math.max(best, tokenSimilarity(query, candidate));
  }

  // Whole-string containment (e.g. query "ahmad" in "ahmad ali") is a strong
  // signal even when no single token is an exact hit.
  if (best < 0.7 && (fullName.includes(query) || query.includes(nameTokens[0] ?? '\0'))) {
    best = Math.max(best, 0.7);
  }

  return best;
}
