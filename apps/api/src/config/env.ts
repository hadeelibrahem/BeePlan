import { z } from 'zod';

export const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url().optional(),
  DB_SSL: z.coerce.boolean().default(false),
  NODE_ENV: z.string().optional(),
  JWT_SECRET: z.string().min(16).optional(),
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
  ASSEMBLYAI_API_KEY: z.string().min(1, 'ASSEMBLYAI_API_KEY is required'),
  QWEN_API_KEY: z.string().min(1, 'QWEN_API_KEY is required'),
  QWEN_BASE_URL: z.string().url('QWEN_BASE_URL is required'),
  QWEN_MODEL: z.string().min(1, 'QWEN_MODEL is required'),
});

export type Env = z.infer<typeof envSchema>;
