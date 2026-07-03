import React, {
  createContext,
  useCallback,
  useEffect,
  useLayoutEffect,
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
import { setAuthToken } from '../lib/authToken';
import {
  getGoogleApprovalStatus,
  parseApprovalToken,
  parseGoogleOAuthMessage,
  parseGoogleOAuthUrl,
  startGoogleSignIn,
} from '../services/auth.service';

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
  oauthMessage: string;
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
  const [oauthMessage, setOauthMessage] = useState('');
  const [pendingApprovalToken, setPendingApprovalToken] = useState('');
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

  // Sync the token holder in a layout effect, not a plain render-body call (impure — could
  // fire for renders React discards under Strict Mode/concurrent rendering) and not a
  // passive `useEffect` (those fire child-before-parent, so a consumer's own
  // `useEffect(() => fetchReminders(), [user])` could run before this provider's effect
  // and send a request with no token). All layout effects in the tree run synchronously,
  // before ANY passive effect anywhere fires, so this ordering guarantee holds regardless
  // of how deep the consumer is.
  useLayoutEffect(() => {
    setAuthToken(session?.accessToken ?? null);
  }, [session]);

  useEffect(() => {
    const handleUrl = async (url: string | null) => {
      if (!url) return;

      const googleMessage = parseGoogleOAuthMessage(url);
      const googleSession = parseGoogleOAuthUrl(url);

      if (googleMessage) {
        setOauthMessage(googleMessage);
        setOauthError('');
        setPendingApprovalToken(parseApprovalToken(url));
        return;
      }

      if (!googleSession) return;

      setOauthError('');
      setOauthMessage('');
      setPendingApprovalToken('');
      await saveSession(googleSession);
    };

    Linking.getInitialURL().then((url) => {
      void handleUrl(url).catch((error) => {
        setOauthError(error instanceof Error ? error.message : 'Google sign-in failed. Please try again.');
        setOauthMessage('');
      });
    });

    const subscription = Linking.addEventListener('url', ({ url }) => {
      void handleUrl(url).catch((error) => {
        setOauthError(error instanceof Error ? error.message : 'Google sign-in failed. Please try again.');
        setOauthMessage('');
      });
    });

    return () => subscription.remove();
  }, [saveSession]);

  useEffect(() => {
    if (!pendingApprovalToken || session) return;

    let active = true;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const pollApproval = async () => {
      try {
        const result = await getGoogleApprovalStatus(pendingApprovalToken);

        if (!active) return;

        if (result.status === 'approved') {
          await saveSession({ accessToken: result.accessToken, user: result.user });
          setOauthError('');
          setOauthMessage('');
          setPendingApprovalToken('');
          return;
        }

        if (result.status === 'denied') {
          setOauthError('The login request was denied.');
          setOauthMessage('');
          setPendingApprovalToken('');
          return;
        }

        if (result.status === 'expired') {
          setOauthError('The login approval link has expired. Please try again.');
          setOauthMessage('');
          setPendingApprovalToken('');
          return;
        }

        timeoutId = setTimeout(pollApproval, 2000);
      } catch (error) {
        if (!active) return;
        setOauthError(error instanceof Error ? error.message : 'Unable to check login approval.');
        setOauthMessage('');
        setPendingApprovalToken('');
      }
    };

    timeoutId = setTimeout(pollApproval, 1000);

    return () => {
      active = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [pendingApprovalToken, saveSession, session]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const authResponse = await login({
        email: email.trim().toLowerCase(),
        password,
      });

      await saveSession(authResponse);
      setOauthError('');
      setOauthMessage('');
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
      setOauthMessage('');

      return true;
    },
    [saveSession],
  );

  const signInWithGoogle = useCallback(async () => {
    setOauthError('');
    setOauthMessage('');
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
    setOauthMessage('');
    setPendingApprovalToken('');
    setSession(null);
  }, []);

  const clearOAuthError = useCallback(() => {
    setOauthError('');
    setOauthMessage('');
    setPendingApprovalToken('');
  }, []);

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      accessToken: session?.accessToken ?? null,
      loading,
      oauthError,
      oauthMessage,
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
      oauthMessage,
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
