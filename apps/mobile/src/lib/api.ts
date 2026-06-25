import { z } from 'zod';

const healthSchema = z.object({
  ok: z.boolean(),
  service: z.string(),
  timestamp: z.string(),
});

export type HealthResponse = z.infer<typeof healthSchema>;

const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch(`${apiUrl}/health`);

  if (!response.ok) {
    throw new Error('Unable to reach API');
  }

  return healthSchema.parse(await response.json());
}
