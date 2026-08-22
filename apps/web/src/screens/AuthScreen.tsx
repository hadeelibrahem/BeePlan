import { useRef, useState, type FormEvent } from 'react'
import {
  AuthCard,
  AuthFooterLink,
  AuthInput,
  AuthShell,
  BrandHeader,
  PrimaryButton,
} from '../components/AuthShared'
import { useAuth } from '../hooks/useAuth'
import { SocialLogin } from '../components/auth/SocialLogin'
import {
  getPasswordStrength,
  hasNoErrors,
  validateSignIn,
  validateSignUp,
  type AuthErrors,
} from '../lib/authValidation'
import { useLanguage } from '../i18n/LanguageContext'

const authValidationKeys: Record<string, string> = {
  'Full name is required': 'auth.fullNameRequired',
  'Email address is required': 'auth.emailRequired',
  'Please enter a valid email address': 'auth.emailInvalid',
  'Password is required': 'auth.passwordRequired',
  'Password must be at least 8 characters and include uppercase, lowercase, number, and @ # $ % &': 'auth.passwordRequirements',
  'Please confirm your password': 'auth.confirmPasswordRequired',
  'Passwords do not match': 'auth.passwordsDoNotMatch',
}

export default function AuthScreen({ onForgot }: { onForgot: () => void }) {
  const { t } = useLanguage()
  const { clearOAuthError, oauthError, oauthMessage, signIn, signUp } = useAuth()
  const submitInFlightRef = useRef(false)
  const [isSignUp, setIsSignUp] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<AuthErrors>({})
  const [isLoading, setIsLoading] = useState(false)
  const [shakeActive, setShakeActive] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const signUpFields = { name, email, password, confirmPassword }
  const passwordStrength = getPasswordStrength(password)
  const isSignUpValid = hasNoErrors(validateSignUp(signUpFields))
  const isSubmitDisabled = isLoading || (isSignUp && !isSignUpValid)

  const validate = () => {
    const e = isSignUp ? validateSignUp(signUpFields) : validateSignIn(email, password)
    setErrors(e)
    return hasNoErrors(e)
  }

  const handleSubmit = async (ev: FormEvent) => {
    ev.preventDefault()
    if (submitInFlightRef.current) {
      return
    }

    setSubmitError('')
    clearOAuthError()
    setSuccessMessage('')
    if (!validate()) {
      setShakeActive(true)
      setTimeout(() => setShakeActive(false), 500)
      return
    }
    submitInFlightRef.current = true
    setIsLoading(true)
    try {
      if (isSignUp) {
        const hasSession = await signUp({ fullName: name.trim(), email: email.trim(), password })
        if (!hasSession) {
          setSuccessMessage('auth.accountCreatedCheckEmail')
          return
        }
      } else {
        await signIn(email, password)
      }
    } catch (error) {
      console.error('Authentication request failed', error)
      setSubmitError(isSignUp ? 'auth.signUpFailed' : 'auth.signInFailed')
    } finally {
      submitInFlightRef.current = false
      setIsLoading(false)
    }
  }

  const reset = () => {
    setName('')
    setEmail('')
    setPassword('')
    setConfirmPassword('')
    setErrors({})
    setSubmitError('')
    clearOAuthError()
    setSuccessMessage('')
  }
  const toggleMode = () => {
    setIsSignUp((s) => !s)
    reset()
  }

  return (
    <AuthShell
      headline={
        <>
          {t('auth.organizeHeadline')} <span className="text-[var(--bp-accent-ink)] text-glow">{t('auth.smartPlans')}</span>.
        </>
      }
      sub={t('auth.signInHeroDescription')}
    >
      <AuthCard shake={shakeActive}>
        <div className="animate-scale-up">
            <BrandHeader />
            <div className="text-center mb-6">
              <h3 className="text-xl font-bold text-[var(--bp-text)]">
                {isSignUp ? t('auth.createAccountTitle') : t('auth.welcomeBackTitle')}
              </h3>
              <p className="text-xs text-[var(--bp-muted)] mt-1.5 leading-relaxed">
                {isSignUp
                  ? t('auth.createAccountSubtitle', { brand_name: 'BeePlan' })
                  : t('auth.signInSubtitle')}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {isSignUp && (
                <AuthInput
                  label={t('auth.fullName')}
                  placeholder={t('auth.fullNamePlaceholder')}
                  value={name}
                  onChange={(v) => {
                    setName(v)
                    setErrors((p) => ({
                      ...p,
                      name: isSignUp && !v.trim() ? 'Full name is required' : undefined,
                    }))
                    setSubmitError('')
                    setSuccessMessage('')
                  }}
                  error={errors.name ? t(authValidationKeys[errors.name] ?? 'auth.validationFailed') : undefined}
                />
              )}
              <AuthInput
                label={t('auth.emailAddress')}
                placeholder={t('auth.emailPlaceholder')}
                value={email}
                onChange={(v) => {
                  setEmail(v)
                  setErrors((p) => ({
                    ...p,
                    email: validateSignUp({ ...signUpFields, email: v }).email,
                  }))
                  setSubmitError('')
                  setSuccessMessage('')
                }}
                error={errors.email ? t(authValidationKeys[errors.email] ?? 'auth.validationFailed') : undefined}
              />
              <AuthInput
                label={t('auth.password')}
                placeholder={t('auth.passwordPlaceholder')}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(v) => {
                  setPassword(v)
                  setErrors((p) => ({
                    ...p,
                    password: isSignUp
                      ? validateSignUp({ ...signUpFields, password: v }).password
                      : undefined,
                    confirmPassword:
                      isSignUp && confirmPassword && confirmPassword !== v
                        ? 'Passwords do not match'
                        : undefined,
                  }))
                  setSubmitError('')
                  setSuccessMessage('')
                }}
                error={errors.password ? t(authValidationKeys[errors.password] ?? 'auth.validationFailed') : undefined}
                rightSlot={
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="text-[9px] font-bold text-[var(--bp-muted)] hover:text-[var(--bp-text)] px-1"
                    >
                      {showPassword ? t('common.hide') : t('common.show')}
                    </button>
                    {!isSignUp && (
                      <button
                        type="button"
                        onClick={onForgot}
                        className="text-[9px] font-bold text-[var(--bp-accent-ink)] hover:underline whitespace-nowrap"
                      >
                        {t('auth.forgotShort')}
                      </button>
                    )}
                  </div>
                }
              />
              {isSignUp && password && (
                <PasswordStrengthMeter strength={passwordStrength} />
              )}
              {isSignUp && (
                <AuthInput
                  label={t('auth.confirmPassword')}
                  placeholder={t('auth.confirmPasswordPlaceholder')}
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(v) => {
                    setConfirmPassword(v)
                    setErrors((p) => ({
                      ...p,
                      confirmPassword:
                        validateSignUp({ ...signUpFields, confirmPassword: v }).confirmPassword,
                    }))
                    setSubmitError('')
                    setSuccessMessage('')
                  }}
                  error={errors.confirmPassword ? t(authValidationKeys[errors.confirmPassword] ?? 'auth.validationFailed') : undefined}
                />
              )}
              {(oauthError || submitError) && (
                <p className="text-red-400 text-xs ps-1">{t(oauthError ? 'auth.socialLoginFailed' : submitError)}</p>
              )}
              {(oauthMessage || successMessage) && (
                <p className="text-emerald-400 text-xs ps-1">{t(oauthMessage ? 'auth.socialLoginSuccess' : successMessage)}</p>
              )}
              <div className="pt-1">
                <PrimaryButton loading={isLoading} disabled={isSubmitDisabled}>
                  {isSignUp ? t('auth.createAccount') : t('auth.signIn')}
                </PrimaryButton>
              </div>
            </form>

            <div className="flex items-center my-5">
              <div className="flex-grow h-px bg-[var(--bp-border)]" />
              <span className="text-[9px] text-[var(--bp-muted)] uppercase tracking-wider font-semibold px-3">
                {t('auth.orContinueWith')}
              </span>
              <div className="flex-grow h-px bg-[var(--bp-border)]" />
            </div>

            <SocialLogin disabled={isLoading} onError={(message) => setSubmitError(message ? 'auth.socialLoginFailed' : '')} />

            <AuthFooterLink
              prefix={isSignUp ? t('auth.alreadyHaveAccount') : t('auth.dontHaveAccount')}
              label={isSignUp ? t('auth.signIn') : t('auth.signUp')}
              onClick={toggleMode}
            />
        </div>
      </AuthCard>
    </AuthShell>
  )
}

function PasswordStrengthMeter({ strength }: { strength: 'Weak' | 'Medium' | 'Strong' }) {
  const { t } = useLanguage()
  const filled = strength === 'Strong' ? 3 : strength === 'Medium' ? 2 : 1
  const tone = strength === 'Strong' ? 'bg-emerald-500' : strength === 'Medium' ? 'bg-amber-400' : 'bg-red-500'
  return (
    <div className="space-y-1 ps-1" aria-live="polite">
      <div className="flex gap-1" role="progressbar" aria-label={t('auth.passwordStrength', { strength: t(`auth.${strength.toLowerCase()}`) })} aria-valuemin={0} aria-valuemax={3} aria-valuenow={filled}>
        {[1, 2, 3].map((segment) => <span key={segment} className={`h-1.5 flex-1 rounded-full ${segment <= filled ? tone : 'bg-[var(--bp-border)]'}`} />)}
      </div>
      <p className="text-xs text-[var(--bp-muted)]">{t('auth.passwordStrength', { strength: t(`auth.${strength.toLowerCase()}`) })}</p>
    </div>
  )
}

