import {
  createContext,
  useCallback,
  useEffect,
  useLayoutEffect,
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
import { setAuthToken } from '../lib/authToken';
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
  oauthMessage: string;
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
  const [oauthMessage, setOauthMessage] = useState('');
  const [pendingApprovalToken, setPendingApprovalToken] = useState('');
  const [verifiedReset, setVerifiedReset] = useState<{ email: string; code: string } | null>(null);

  const saveSession = useCallback((nextSession: AuthSession) => {
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextSession));
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
        if (!active) return;

        const socialMessage = authService.getSocialMessage();
        const approvalToken = authService.getApprovalToken();

        if (socialMessage) {
          setOauthMessage(socialMessage);
          setOauthError('');
          setPendingApprovalToken(approvalToken);
          authService.clearSocialSessionFromUrl('/sign-in');
          return;
        }

        if (!socialSession) return;

        saveSession(socialSession);
        setOauthError('');
        setOauthMessage('');
        authService.clearSocialSessionFromUrl();
      })
      .catch((error) => {
        if (active) {
          const message = error instanceof Error ? error.message : 'Google sign-in failed. Please try again.';
          setOauthError(message);
          setOauthMessage('');
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

  useEffect(() => {
    if (!pendingApprovalToken || session) return;

    let active = true;
    let timeoutId: number | undefined;

    const pollApproval = async () => {
      try {
        const result = await authService.getGoogleApprovalStatus(pendingApprovalToken);

        if (!active) return;

        if (result.status === 'approved') {
          saveSession({
            accessToken: result.accessToken,
            user: result.user,
          });
          setOauthError('');
          setOauthMessage('');
          setPendingApprovalToken('');
          authService.clearSocialSessionFromUrl();
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

        timeoutId = window.setTimeout(pollApproval, 2000);
      } catch (error) {
        if (!active) return;
        setOauthError(error instanceof Error ? error.message : 'Unable to check login approval.');
        setOauthMessage('');
        setPendingApprovalToken('');
      }
    };

    timeoutId = window.setTimeout(pollApproval, 1000);

    return () => {
      active = false;
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [pendingApprovalToken, saveSession, session]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      setOauthError('');
      setOauthMessage('');
      setPendingApprovalToken('');
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
      setOauthMessage('');
      setPendingApprovalToken('');
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
      signOut,
      signUp,
      updatePassword,
      verifyRecoveryCode,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
