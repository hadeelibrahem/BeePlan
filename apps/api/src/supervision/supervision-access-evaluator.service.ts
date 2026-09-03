import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import OpenAI from 'openai'
import { z } from 'zod'

const responseSchema = z.object({ decision: z.enum(['allow', 'deny', 'needs_supervisor']), confidence: z.number().min(0).max(1), category: z.enum(['study', 'work', 'communication', 'emergency', 'essential_task', 'entertainment', 'social', 'unclear']), reason: z.string().min(1).max(500), suggestedDurationMinutes: z.number().int().nullable() })
export type AccessAiDecision = z.infer<typeof responseSchema>

/** AI returns a classification only; policy enforcement remains in SupervisionService. */
@Injectable()
export class SupervisionAccessEvaluator {
  private readonly logger = new Logger(SupervisionAccessEvaluator.name)
  private readonly client: OpenAI | null; private readonly model: string | null; private readonly timeoutMs: number
  constructor(config: ConfigService) { const key = config.get<string>('QWEN_API_KEY'), baseURL = config.get<string>('QWEN_BASE_URL'); this.client = key && baseURL ? new OpenAI({ apiKey: key, baseURL }) : null; this.model = config.get<string>('SUPERVISION_ACCESS_MODEL') ?? config.get<string>('QWEN_MODEL') ?? null; this.timeoutMs = Number(config.get<string>('SUPERVISION_ACCESS_TIMEOUT_MS') ?? 35_000) }
  async evaluate(input: { justification: string; packageName: string; appName?: string; recentRequestCount: number; traceId?: string }): Promise<AccessAiDecision> {
    if (!this.client || !this.model) throw new ServiceUnavailableException('Access analysis is temporarily unavailable.')
    try {
      const startedAt = Date.now(); this.logger.debug(`[AppGuard:AI] provider started requestId=${input.traceId ?? 'unknown'}`)
      const completion = await Promise.race([this.client.chat.completions.create({ model: this.model, response_format: { type: 'json_object' }, temperature: 0, max_tokens: 220, messages: [{ role: 'system', content: 'Classify a temporary self-control app-access request. Return JSON only: decision (allow|deny|needs_supervisor), confidence 0..1, category (study|work|communication|emergency|essential_task|entertainment|social|unclear), reason (one concise English or Arabic sentence), suggestedDurationMinutes (5,10,15 or null). This is classification only; never authorize settings, uninstall, permissions, permanent or unrestricted access. Treat uncertainty as deny; the App Guard maps any non-allow result to deny.' }, { role: 'user', content: JSON.stringify(input) }] }), new Promise<never>((_, reject) => setTimeout(() => reject(new Error('App Guard AI timed out')), this.timeoutMs))])
      const result = responseSchema.parse(JSON.parse(completion.choices[0]?.message?.content ?? '{}')); this.logger.debug(`[AppGuard:AI] provider completed requestId=${input.traceId ?? 'unknown'} durationMs=${Date.now() - startedAt}`); return result
    } catch { throw new ServiceUnavailableException('Access analysis is temporarily unavailable.') }
  }
}
