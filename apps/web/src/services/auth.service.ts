import type { AuthResponse, AuthUser } from '../lib/api';

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const socialRedirectStorageKey = 'beeplan_social_redirect_path';

export type SocialAuthProvider = 'google' | 'apple';

export type SocialAuthResult = {
  cancelled: boolean;
};

type GoogleApprovalStatus =
  | { status: 'pending' | 'denied' | 'expired' | 'used' }
  | ({ status: 'approved' } & AuthResponse);

function getRedirectPath() {
  const currentPath = `${window.location.pathname}${window.location.search}`;
  const redirectPath = currentPath.startsWith('/sign-in') ? '/' : currentPath;

  window.sessionStorage.setItem(socialRedirectStorageKey, redirectPath);

  return redirectPath;
}

function getStoredRedirectPath() {
  const redirectPath = window.sessionStorage.getItem(socialRedirectStorageKey);

  if (!redirectPath || redirectPath === '/' || redirectPath.startsWith('/sign-in')) {
    return '/dashboard';
  }

  return redirectPath;
}

function clearOAuthHash(path = getStoredRedirectPath()) {
  if (!window.location.hash && !window.location.search) return;

  window.history.replaceState(null, '', path);
}

function base64UrlDecode(value: string) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const bytes = Uint8Array.from(window.atob(padded), (character) => character.charCodeAt(0));

  return new TextDecoder().decode(bytes);
}

function parseOAuthSession(): AuthResponse | null {
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const queryParams = new URLSearchParams(window.location.search);
  const accessToken = queryParams.get('token') ?? hashParams.get('access_token');
  const encodedUser = queryParams.get('user') ?? hashParams.get('user');
  const error = queryParams.get('error') ?? hashParams.get('error');

  if (error) {
    throw new Error(error);
  }

  if (!accessToken || !encodedUser) {
    return null;
  }

  try {
    const user = JSON.parse(encodedUser) as AuthUser;

    return {
      accessToken,
      user,
    };
  } catch {
    try {
      const user = JSON.parse(base64UrlDecode(encodedUser)) as AuthUser;

      return {
        accessToken,
        user,
      };
    } catch {
      throw new Error('Google login failed. Please try again.');
    }
  }
}

function parseOAuthMessage() {
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const queryParams = new URLSearchParams(window.location.search);

  return queryParams.get('message') ?? hashParams.get('message') ?? '';
}

function parseApprovalToken() {
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const queryParams = new URLSearchParams(window.location.search);

  return queryParams.get('approval_token') ?? hashParams.get('approval_token') ?? '';
}

export const authService = {
  async signInWithSocial(provider: SocialAuthProvider): Promise<SocialAuthResult> {
    if (provider === 'apple') {
      throw new Error('Apple Sign In will be available in the production version.');
    }

    const redirectPath = getRedirectPath();
    const params = new URLSearchParams({
      redirectPath,
      returnTo: `${window.location.origin}${redirectPath}`,
    });

    window.location.assign(`${apiUrl}/auth/google?${params.toString()}`);

    return { cancelled: false };
  },

  async getSocialSession(): Promise<AuthResponse | null> {
    return parseOAuthSession();
  },

  getSocialMessage() {
    return parseOAuthMessage();
  },

  getApprovalToken() {
    return parseApprovalToken();
  },

  async getGoogleApprovalStatus(token: string): Promise<GoogleApprovalStatus> {
    const response = await fetch(`${apiUrl}/auth/google/approval/status?${new URLSearchParams({ token })}`);
    const data = (await response.json().catch(() => null)) as GoogleApprovalStatus | { message?: string } | null;

    if (!response.ok) {
      throw new Error((data && 'message' in data && data.message) || 'Unable to check login approval.');
    }

    if (!data || !('status' in data)) {
      throw new Error('Unable to check login approval.');
    }

    return data;
  },

  clearSocialSessionFromUrl(path?: string) {
    clearOAuthHash(path);
  },

  async signOutSocial() {
    window.sessionStorage.removeItem(socialRedirectStorageKey);
  },
};
