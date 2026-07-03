import { z } from 'zod';

const apiUrl = (import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3000').replace(/\/+$/, '');

if (import.meta.env.DEV) {
  console.log('[BeePlan API] Base URL:', apiUrl);
}

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

export type SocialLoginRequest = {
  provider: 'google' | 'apple';
  providerUserId: string;
  email: string;
  fullName?: string;
  avatarUrl?: string | null;
};

async function apiRequest(path: string, init?: RequestInit) {
  const url = `${apiUrl}${path}`;
  const method = init?.method ?? 'GET';

  if (import.meta.env.DEV) {
    console.log('[BeePlan API] ->', method, path);
  }

  let response: Response;

  try {
    response = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    });
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('[BeePlan API] Network request failed', {
        url,
        method,
        error: error instanceof Error ? error.message : error,
      });
    }
    throw new Error(`Unable to reach BeePlan API at ${apiUrl}. Make sure the backend is running on port 3000.`);
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    if (import.meta.env.DEV) {
      console.error('[BeePlan API] Request failed', {
        url,
        method,
        status: response.status,
        data,
      });
    }
    throw new Error(data?.message ?? 'Something went wrong. Please try again.');
  }

  return data;
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
  return authResponseSchema.parse(
    await apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  );
}

export async function login(payload: LoginRequest): Promise<AuthResponse> {
  return authResponseSchema.parse(
    await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  );
}

export async function socialLogin(payload: SocialLoginRequest): Promise<AuthResponse> {
  return authResponseSchema.parse(
    await apiRequest('/auth/social-login', {
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
  const data = await apiRequest(`/auth/exists?email=${encodeURIComponent(email)}`);

  return userExistsResponseSchema.parse(data).exists;
}
