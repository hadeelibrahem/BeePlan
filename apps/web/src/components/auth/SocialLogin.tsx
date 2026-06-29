import { lazy, memo, Suspense, useCallback, useMemo, useRef, useState } from 'react';
import { authService, type SocialAuthProvider } from '../../services/auth.service';

const GoogleIcon = lazy(() =>
  import('./SocialIcons').then((module) => ({ default: module.GoogleIcon })),
);
const AppleIcon = lazy(() =>
  import('./SocialIcons').then((module) => ({ default: module.AppleIcon })),
);

type SocialProviderConfig = {
  provider: SocialAuthProvider;
  label: string;
  ariaLabel: string;
  enabled: boolean;
  disabledMessage?: string;
};

type SocialLoginProps = {
  disabled?: boolean;
  onError?: (message: string) => void;
};

const copy = {
  google: {
    label: 'Continue with Google',
    ariaLabel: 'Continue with Google',
  },
  apple: {
    label: 'Continue with Apple',
    ariaLabel: 'Continue with Apple',
    disabledMessage: 'Apple Sign In will be available in the production version.',
  },
  errors: {
    fallback: 'Social login is unavailable. Please try again.',
  },
};

function ProviderIcon({ provider }: { provider: SocialAuthProvider }) {
  const fallback = <span className="h-4 w-4 rounded-full bg-white/80" aria-hidden="true" />;

  return (
    <Suspense fallback={fallback}>
      {provider === 'google' ? (
        <GoogleIcon className="h-4 w-4 shrink-0" />
      ) : (
        <AppleIcon className="h-4 w-4 shrink-0 text-white" />
      )}
    </Suspense>
  );
}

function LoadingSpinner() {
  return (
    <span
      className="h-4 w-4 rounded-full border-2 border-white/25 border-t-white animate-spin"
      aria-hidden="true"
    />
  );
}

function SocialLoginComponent({ disabled = false, onError }: SocialLoginProps) {
  const requestInFlightRef = useRef(false);
  const [loadingProvider, setLoadingProvider] = useState<SocialAuthProvider | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const providers = useMemo<SocialProviderConfig[]>(
    () => [
      {
        provider: 'google',
        label: copy.google.label,
        ariaLabel: copy.google.ariaLabel,
        enabled: true,
      },
      {
        provider: 'apple',
        label: copy.apple.label,
        ariaLabel: copy.apple.ariaLabel,
        enabled: false,
        disabledMessage: copy.apple.disabledMessage,
      },
    ],
    [],
  );

  const handleSocialLogin = useCallback(
    async (provider: SocialAuthProvider) => {
      if (requestInFlightRef.current || disabled) return;

      requestInFlightRef.current = true;
      setLoadingProvider(provider);
      setErrorMessage('');
      onError?.('');

      try {
        const result = await authService.signInWithSocial(provider);

        if (result.cancelled) return;
      } catch (error) {
        const message = error instanceof Error ? error.message : copy.errors.fallback;
        setErrorMessage(message);
        onError?.(message);
      } finally {
        requestInFlightRef.current = false;
        setLoadingProvider(null);
      }
    },
    [disabled, onError],
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {providers.map(({ provider, label, ariaLabel, enabled, disabledMessage }) => {
          const isLoading = loadingProvider === provider;
          const isDisabled = disabled || Boolean(loadingProvider) || !enabled;

          return (
            <button
              key={provider}
              type="button"
              aria-label={ariaLabel}
              title={disabledMessage}
              aria-busy={isLoading}
              aria-disabled={isDisabled}
              disabled={isDisabled}
              onClick={() => void handleSocialLogin(provider)}
              className="group h-12 w-full rounded-2xl border border-[#3B465B] bg-[#2B3443] px-4 text-white shadow-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-[#4B5870] hover:bg-[#2B3443] hover:shadow-lg hover:shadow-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FDE64B] focus-visible:ring-offset-2 focus-visible:ring-offset-[#2B3443] active:translate-y-0 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0 disabled:hover:bg-[#2B3443]"
            >
              <span className="flex items-center justify-center gap-3 text-sm font-bold">
                {isLoading ? <LoadingSpinner /> : <ProviderIcon provider={provider} />}
                <span className="whitespace-nowrap">{enabled ? label : 'Coming Soon'}</span>
              </span>
              {!enabled && <span className="sr-only">{disabledMessage}</span>}
            </button>
          );
        })}
      </div>
      {errorMessage && (
        <p role="alert" className="text-red-400 text-xs pl-1">
          {errorMessage}
        </p>
      )}
    </div>
  );
}

export const SocialLogin = memo(SocialLoginComponent);

