import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import * as SecureStore from 'expo-secure-store';
import { Linking } from 'react-native';
import {
  forgotPassword,
  login,
  register,
  resetPassword,
  verifyResetCode,
  type AuthUser,
} from '../lib/api';
import { parseGoogleOAuthUrl, startGoogleSignIn } from '../services/auth.service';

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
  signInWithGoogle: () => Promise<void>;
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

  useEffect(() => {
    let active = true;

    SecureStore.getItemAsync(AUTH_STORAGE_KEY)
      .then((storedSession) => {
        if (!active || !storedSession) return;

        try {
          setSession(JSON.parse(storedSession) as AuthSession);
        } catch {
          void SecureStore.deleteItemAsync(AUTH_STORAGE_KEY);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const saveSession = useCallback(async (nextSession: AuthSession) => {
    await SecureStore.setItemAsync(AUTH_STORAGE_KEY, JSON.stringify(nextSession));
    setSession(nextSession);
  }, []);

  useEffect(() => {
    const handleUrl = async (url: string | null) => {
      if (!url) return;

      const googleSession = parseGoogleOAuthUrl(url);

      if (!googleSession) return;

      setOauthError('');
      await saveSession(googleSession);
    };

    Linking.getInitialURL().then((url) => {
      void handleUrl(url).catch((error) => {
        setOauthError(error instanceof Error ? error.message : 'Google sign-in failed. Please try again.');
      });
    });

    const subscription = Linking.addEventListener('url', ({ url }) => {
      void handleUrl(url).catch((error) => {
        setOauthError(error instanceof Error ? error.message : 'Google sign-in failed. Please try again.');
      });
    });

    return () => subscription.remove();
  }, [saveSession]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const authResponse = await login({
        email: email.trim().toLowerCase(),
        password,
      });

      await saveSession(authResponse);
      setOauthError('');
    },
    [saveSession],
  );

  const signUp = useCallback(
    async ({ fullName, email, password }: { fullName: string; email: string; password: string }) => {
      const authResponse = await register({
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        password,
      });

      await saveSession(authResponse);
      setOauthError('');

      return true;
    },
    [saveSession],
  );

  const signInWithGoogle = useCallback(async () => {
    setOauthError('');
    await startGoogleSignIn();
  }, []);

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
      await saveSession(authResponse);
      setVerifiedReset(null);
    },
    [saveSession, verifiedReset],
  );

  const signOut = useCallback(async () => {
    await SecureStore.deleteItemAsync(AUTH_STORAGE_KEY);
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
      signInWithGoogle,
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
      signInWithGoogle,
      signOut,
      signUp,
      updatePassword,
      verifyRecoveryCode,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
