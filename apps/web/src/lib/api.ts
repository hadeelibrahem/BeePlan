import { z } from 'zod';

const healthSchema = z.object({
  ok: z.boolean(),
  service: z.string(),
  timestamp: z.string(),
});

const signUpResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    fullName: z.string(),
    email: z.string(),
    avatarUrl: z.string().nullable(),
    timezone: z.string(),
    createdAt: z.string().or(z.date()),
  }),
});

export type HealthResponse = z.infer<typeof healthSchema>;

export type SignUpRequest = {
  fullName: string;
  email: string;
  password: string;
};

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch('http://localhost:3000/health');

  if (!response.ok) {
    throw new Error('Unable to reach API');
  }

  return healthSchema.parse(await response.json());
}

export async function signUp(payload: SignUpRequest): Promise<void> {
  const response = await fetch('http://localhost:3000/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.message ?? 'Sign up failed. Please try again.');
  }

  signUpResponseSchema.parse(data);
}
