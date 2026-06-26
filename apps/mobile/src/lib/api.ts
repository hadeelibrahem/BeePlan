import { z } from 'zod';

const healthSchema = z.object({
  ok: z.boolean(),
  service: z.string(),
  timestamp: z.string(),
});

export type HealthResponse = z.infer<typeof healthSchema>;

export type SignUpRequest = {
  fullName: string;
  email: string;
  password: string;
};

const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch(`${apiUrl}/health`);

  if (!response.ok) {
    throw new Error('Unable to reach API');
  }

  return healthSchema.parse(await response.json());
}

export async function signUp(_payload: SignUpRequest): Promise<void> {
  // Placeholder until the backend exposes a real signup endpoint.
  await new Promise((resolve) => setTimeout(resolve, 900));
}
