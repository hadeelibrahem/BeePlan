import { z } from 'zod';
import { API_BASE_URL, ApiRequestError, apiFetch, checkApiHealth, readJsonOrThrow } from './apiClient';

const healthSchema = z.object({
  ok: z.boolean(),
  service: z.string(),
  timestamp: z.string(),
});

const authUserSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  email: z.string(),
  avatarUrl: z.string().nullable(),
  authProvider: z.string().optional(),
  googleId: z.string().nullable().optional(),
  emailVerified: z.boolean().optional(),
  timezone: z.string(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});

const authResponseSchema = z.object({
  accessToken: z.string(),
  user: authUserSchema,
});

const userExistsResponseSchema = z.object({
  exists: z.boolean(),
});

const okResponseSchema = z.object({
  ok: z.boolean(),
});

const forgotPasswordResponseSchema = okResponseSchema.extend({
  devResetCode: z.string().optional(),
});

export type HealthResponse = z.infer<typeof healthSchema>;
export type AuthUser = z.infer<typeof authUserSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;

export type RegisterRequest = {
  fullName: string;
  email: string;
  password: string;
};

export type LoginRequest = {
  email: string;
  password: string;
};

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  return readJsonOrThrow<T>(response, `${API_BASE_URL}${path}`);
}

export function getAuthHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
  };
}

export async function logout(accessToken: string): Promise<void> {
  await apiRequest('/auth/logout', {
    method: 'POST',
    headers: getAuthHeaders(accessToken),
  });
}

export async function fetchHealth(): Promise<HealthResponse> {
  return healthSchema.parse(await apiRequest('/health'));
}

export async function register(payload: RegisterRequest): Promise<AuthResponse> {
  console.log('[BeePlan Auth] Attempting sign up against', API_BASE_URL);

  return authResponseSchema.parse(
    await apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  );
}

export async function login(payload: LoginRequest): Promise<AuthResponse> {
  console.log('[BeePlan Auth] Attempting login against', API_BASE_URL);

  const isHealthy = await checkApiHealth();
  console.log('[BeePlan Auth] Pre-login health check:', isHealthy ? 'reachable' : 'unreachable');

  if (!isHealthy) {
    throw new ApiRequestError(
      `Cannot reach the BeePlan server at ${API_BASE_URL || '(no URL configured)'} right now. Check that the ` +
        'backend is running, your phone is on the same network, and EXPO_PUBLIC_API_URL is correct.',
      'server',
    );
  }

  return authResponseSchema.parse(
    await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  );
}

export async function forgotPassword(email: string): Promise<string | undefined> {
  const data = forgotPasswordResponseSchema.parse(
    await apiRequest('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  );

  return data.devResetCode;
}

export async function verifyResetCode(email: string, code: string): Promise<void> {
  okResponseSchema.parse(
    await apiRequest('/auth/verify-reset-code', {
      method: 'POST',
      body: JSON.stringify({ email, code }),
    }),
  );
}

export async function resetPassword(email: string, code: string, password: string): Promise<AuthResponse> {
  return authResponseSchema.parse(
    await apiRequest('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email, code, password }),
    }),
  );
}

export async function userExists(email: string): Promise<boolean> {
  const data = await apiRequest<{ exists: boolean }>(`/auth/exists?email=${encodeURIComponent(email)}`);

  return userExistsResponseSchema.parse(data).exists;
}
