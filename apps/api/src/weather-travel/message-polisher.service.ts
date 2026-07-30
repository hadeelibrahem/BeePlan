/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
@Injectable()
export class WeatherTravelMessagePolisher {
  constructor(private readonly config: ConfigService) {}
  async polish(input: {
    deterministicMessage: string;
    facts: Record<string, string | number | boolean | null>;
    language: string;
  }): Promise<string | null> {
    const key =
      this.config.get<string>('OPENROUTER_API_KEY') ??
      this.config.get<string>('QWEN_API_KEY');
    const base =
      this.config.get<string>('OPENROUTER_BASE_URL') ??
      this.config.get<string>('QWEN_BASE_URL');
    const model =
      this.config.get<string>('OPENROUTER_MODEL') ??
      this.config.get<string>('QWEN_MODEL');
    if (!key || !base || !model) return null;
    try {
      const response = await fetch(new URL('/chat/completions', base), {
        method: 'POST',
        headers: {
          authorization: `Bearer ${key}`,
          'content-type': 'application/json',
        },
        signal: AbortSignal.timeout(2500),
        body: JSON.stringify({
          model,
          temperature: 0,
          max_tokens: 160,
          messages: [
            {
              role: 'system',
              content: `Rewrite concisely in ${input.language === 'ar' ? 'Arabic' : 'English'}. Preserve every numeric fact exactly. Never add weather, route, traffic, confidence, certainty, or times. Return only the message.`,
            },
            {
              role: 'user',
              content: JSON.stringify({
                immutableFacts: input.facts,
                message: input.deterministicMessage,
              }),
            },
          ],
        }),
      });
      if (!response.ok) return null;
      const body = await response.json();
      const text = String(body.choices?.[0]?.message?.content ?? '').trim();
      return text && preservesFacts(text, input.facts) ? text : null;
    } catch {
      return null;
    }
  }
}
export function preservesFacts(
  text: string,
  facts: Record<string, string | number | boolean | null>,
) {
  return Object.values(facts)
    .filter(
      (value) =>
        typeof value === 'number' ||
        (typeof value === 'string' && /\d/.test(value)),
    )
    .every((value) => text.includes(String(value)));
}
