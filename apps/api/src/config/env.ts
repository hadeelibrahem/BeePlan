import { z } from 'zod';

export const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url().optional(),
  DB_SSL: z.coerce.boolean().default(false),
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
  PUBLIC_BASE_URL: z.string().url().optional(),
  API_PUBLIC_URL: z.string().url().optional(),
  FRONTEND_URL: z.string().url().optional(),
  WEB_APP_URL: z.string().url().optional(),
  ASSEMBLYAI_API_KEY: z.string().optional(),
  QWEN_API_KEY: z.string().optional(),
  QWEN_BASE_URL: z.string().url().optional(),
  QWEN_MODEL: z.string().optional(),
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
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `Invalid or missing environment variables:\n${issues}\n` +
        'Check apps/api/.env against apps/api/.env.example for the required values.',
    );
  }

  return result.data;
}
