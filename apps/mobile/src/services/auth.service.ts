import { Linking } from 'react-native';
import type { AuthResponse, AuthUser } from '../lib/api';

const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';
const mobileOAuthCallbackUrl = 'beeplan://auth/callback';
const mobileOAuthScheme = 'beeplan://auth/';

type GoogleApprovalStatus =
  | { status: 'pending' | 'denied' | 'expired' }
  | ({ status: 'approved' } & AuthResponse);

function base64UrlDecode(value: string) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');

  return decodeURIComponent(
    Array.from(atob(padded))
      .map((character) => `%${character.charCodeAt(0).toString(16).padStart(2, '0')}`)
      .join(''),
  );
}

function parseOAuthUser(value: string): AuthUser {
  try {
    return JSON.parse(value) as AuthUser;
  } catch {
    return JSON.parse(base64UrlDecode(value)) as AuthUser;
  }
}

export function parseGoogleOAuthUrl(url: string): AuthResponse | null {
  if (!url.startsWith(mobileOAuthScheme)) {
    return null;
  }

  const hash = url.split('#')[1] ?? '';
  const query = url.includes('?') ? (url.split('?')[1] ?? '').split('#')[0] : '';
  const hashParams = new URLSearchParams(hash);
  const queryParams = new URLSearchParams(query);
  const params = queryParams.size > 0 ? queryParams : hashParams;
  const error = params.get('error');
  const accessToken = params.get('token') ?? params.get('access_token');
  const encodedUser = params.get('user');

  if (error) {
    throw new Error(error);
  }

  if (!accessToken || !encodedUser) {
    return null;
  }

  return {
    accessToken,
    user: parseOAuthUser(encodedUser),
  };
}

function getOAuthParams(url: string) {
  if (!url.startsWith(mobileOAuthScheme)) {
    return null;
  }

  const hash = url.split('#')[1] ?? '';
  const query = url.includes('?') ? (url.split('?')[1] ?? '').split('#')[0] : '';
  const hashParams = new URLSearchParams(hash);
  const queryParams = new URLSearchParams(query);

  return queryParams.size > 0 ? queryParams : hashParams;
}

export function parseGoogleOAuthMessage(url: string) {
  return getOAuthParams(url)?.get('message') ?? '';
}

export function parseApprovalToken(url: string) {
  return getOAuthParams(url)?.get('approval_token') ?? '';
}

export async function getGoogleApprovalStatus(token: string): Promise<GoogleApprovalStatus> {
  const response = await fetch(`${apiUrl}/auth/google/approval/status?${new URLSearchParams({ token })}`);
  const data = (await response.json().catch(() => null)) as GoogleApprovalStatus | { message?: string } | null;

  if (!response.ok) {
    throw new Error((data && 'message' in data && data.message) || 'Unable to check login approval.');
  }

  if (!data || !('status' in data)) {
    throw new Error('Unable to check login approval.');
  }

  return data;
}

export async function startGoogleSignIn() {
  const params = new URLSearchParams({
    returnTo: mobileOAuthCallbackUrl,
  });

  const canOpen = await Linking.canOpenURL(`${apiUrl}/auth/google`);

  if (!canOpen) {
    throw new Error('Unable to open Google sign-in. Please try again.');
  }

  await Linking.openURL(`${apiUrl}/auth/google?${params.toString()}`);
}
