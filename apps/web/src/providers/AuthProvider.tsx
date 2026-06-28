import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  forgotPassword,
  login,
  register,
  resetPassword,
  verifyResetCode,
  type AuthUser,
} from '../lib/api';
import { authService } from '../services/auth.service';

const AUTH_STORAGE_KEY = 'beeplan_auth_session';

type AuthSession = {
  accessToken: string;
  user: AuthUser;
};

type AuthContextValue = {
  session: AuthSession | null;
  user: AuthUser | null;
  accessToken: string | null;
  loading: boolean;
  oauthError: string;
  clearOAuthError: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (payload: { fullName: string; email: string; password: string }) => Promise<boolean>;
  sendPasswordReset: (email: string, redirectTo?: string) => Promise<string | undefined>;
  verifyRecoveryCode: (email: string, code: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [oauthError, setOauthError] = useState('');
  const [verifiedReset, setVerifiedReset] = useState<{ email: string; code: string } | null>(null);

  const saveSession = useCallback((nextSession: AuthSession) => {
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextSession));
    setSession(nextSession);
  }, []);

  useEffect(() => {
    let active = true;
    const storedSession = window.localStorage.getItem(AUTH_STORAGE_KEY);

    if (storedSession) {
      try {
        if (active) setSession(JSON.parse(storedSession) as AuthSession);
      } catch {
        window.localStorage.removeItem(AUTH_STORAGE_KEY);
      }
    }

    authService
      .getSocialSession()
      .then((socialSession) => {
        if (!active || !socialSession) return;
        saveSession(socialSession);
        setOauthError('');
        authService.clearSocialSessionFromUrl();
      })
      .catch((error) => {
        if (active) {
          const message = error instanceof Error ? error.message : 'Google sign-in failed. Please try again.';
          setOauthError(message);
          authService.clearSocialSessionFromUrl('/sign-in');
        }
        // Social auth is optional for local development and should never block email login.
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [saveSession]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      setOauthError('');
      const authResponse = await login({
        email: email.trim().toLowerCase(),
        password,
      });

      saveSession(authResponse);
    },
    [saveSession],
  );

  const signUp = useCallback(
    async ({ fullName, email, password }: { fullName: string; email: string; password: string }) => {
      setOauthError('');
      const authResponse = await register({
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        password,
      });

      saveSession(authResponse);

      return true;
    },
    [saveSession],
  );

  const sendPasswordReset = useCallback(async (email: string) => {
    return forgotPassword(email.trim().toLowerCase());
  }, []);

  const verifyRecoveryCode = useCallback(async (email: string, code: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedCode = code.trim();

    await verifyResetCode(normalizedEmail, normalizedCode);
    setVerifiedReset({ email: normalizedEmail, code: normalizedCode });
  }, []);

  const updatePassword = useCallback(
    async (password: string) => {
      if (!verifiedReset) {
        throw new Error('Invalid or expired reset code.');
      }

      const authResponse = await resetPassword(verifiedReset.email, verifiedReset.code, password);
      saveSession(authResponse);
      setVerifiedReset(null);
    },
    [saveSession, verifiedReset],
  );

  const signOut = useCallback(async () => {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    await authService.signOutSocial();
    setOauthError('');
    setSession(null);
  }, []);

  const clearOAuthError = useCallback(() => {
    setOauthError('');
  }, []);

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      accessToken: session?.accessToken ?? null,
      loading,
      oauthError,
      clearOAuthError,
      signIn,
      signUp,
      sendPasswordReset,
      verifyRecoveryCode,
      updatePassword,
      signOut,
    }),
    [
      clearOAuthError,
      loading,
      oauthError,
      session,
      sendPasswordReset,
      signIn,
      signOut,
      signUp,
      updatePassword,
      verifyRecoveryCode,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
