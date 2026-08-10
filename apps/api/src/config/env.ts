import { z } from 'zod';

const booleanFromEnvironment = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  if (value.toLowerCase() === 'true') return true;
  if (value.toLowerCase() === 'false') return false;
  return value;
}, z.boolean());

export const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url().optional(),
  DB_SSL: booleanFromEnvironment.default(false),
  DB_KEEP_ALIVE: booleanFromEnvironment.default(true),
  DB_KEEP_ALIVE_INITIAL_DELAY_MS: z.coerce.number().int().nonnegative().default(10_000),
  DB_POOL_MIN: z.coerce.number().int().min(0).max(10).default(1),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(30).default(10),
  DB_CONNECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  DB_IDLE_TIMEOUT_MS: z.coerce.number().int().positive().default(300_000),
  DB_QUERY_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  DB_APPLICATION_NAME: z.string().min(1).max(63).default('beeplan-api'),
  NODE_ENV: z.string().optional(),
  JWT_SECRET: z.string().min(16),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  RESET_EMAIL_FROM: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
  GOOGLE_WEB_CLIENT_ID: z.string().optional(),
  GOOGLE_WEB_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().url().optional(),
  GOOGLE_REDIRECT_URI: z.string().url().optional(),
  GOOGLE_CALENDAR_CALLBACK_URL: z.string().url().optional(),
  PUBLIC_BASE_URL: z.string().url().optional(),
  API_PUBLIC_URL: z.string().url().optional(),
  FRONTEND_URL: z.string().url().optional(),
  WEB_APP_URL: z.string().url().optional(),
  ASSEMBLYAI_API_KEY: z.string().optional(),
  QWEN_API_KEY: z.string().optional(),
  QWEN_BASE_URL: z.string().url().optional(),
  QWEN_MODEL: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_BASE_URL: z.string().url().optional(),
  OPENROUTER_MODEL: z.string().optional(),
  // Provider call timeout for the AI Collaboration Planner only (see
  // AiCollaborationPlannerService) — a full team + task-context prompt can
  // take longer than other single-shot AI endpoints to reason about.
  AI_COLLABORATION_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(90_000),
  WEATHER_PROVIDER: z.enum(['open-meteo']).default('open-meteo'),
  WEATHER_API_BASE_URL: z.string().url().default('https://api.open-meteo.com'),
  WEATHER_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(8_000),
  WEATHER_CACHE_TTL_MINUTES: z.coerce
    .number()
    .int()
    .min(1)
    .max(120)
    .default(20),
  GEOAPIFY_API_KEY: z.string().optional(),
  GEOAPIFY_ROUTING_BASE_URL: z
    .string()
    .url()
    .default('https://api.geoapify.com'),
  ROUTING_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(8_000),
  WEATHER_WORKER_INTERVAL_MINUTES: z.coerce.number().int().min(1).default(10),
  WEATHER_LOOKAHEAD_HOURS: z.coerce.number().int().min(1).max(168).default(48),
});

export type Env = z.infer<typeof envSchema>;

// `ConfigModule.forRoot({ validate })` calls this once at boot. A raw
// `envSchema.parse(config)` would surface a wall of ZodError JSON on an
// unhandled-rejection crash, which is hard to act on. Reformat failures into
// one line per missing/invalid variable so a misconfigured deployment (e.g.
// missing QWEN_API_KEY) fails loudly with an actionable message instead of an
// opaque stack trace.
export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const issues = result.error.issues
      .map(
        (issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`,
      )
      .join('\n');
    throw new Error(
      `Invalid or missing environment variables:\n${issues}\n` +
        'Check apps/api/.env against apps/api/.env.example for the required values.',
    );
  }

  if (result.data.NODE_ENV === 'production' && !result.data.GEOAPIFY_API_KEY) {
    throw new Error(
      'Invalid or missing environment variables:\n  - GEOAPIFY_API_KEY: required in production for route estimates.',
    );
  }

  return result.data;
}
