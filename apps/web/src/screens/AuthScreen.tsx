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

export default function AuthScreen({ onForgot }: { onForgot: () => void }) {
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
  const [isSuccess, setIsSuccess] = useState(false)
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
          setSuccessMessage('Account created successfully. Please check your email to confirm it.')
          return
        }
      } else {
        await signIn(email, password)
      }
      setIsSuccess(true)
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : isSignUp
            ? 'Sign up failed. Please try again.'
            : 'Sign in failed. Please try again.',
      )
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
          Organize reminders, tasks, and <span className="text-[var(--bp-accent)] text-glow">smart plans</span>.
        </>
      }
      sub="Experience intelligent scheduling and seamless task mapping in a clean, minimal workspace crafted for premium productivity."
    >
      <AuthCard shake={shakeActive}>
        {isSuccess ? (
          <div className="text-center py-6 animate-scale-up">
            <div className="w-20 h-20 flex items-center justify-center mx-auto mb-6">
              <svg className="success-circle-svg" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="40" fill="none" />
                <polyline points="30,52 45,65 70,38" fill="none" />
              </svg>
            </div>
            <h3 className="text-2xl font-bold text-[var(--bp-text)] tracking-tight">Authentication Approved</h3>
            <p className="text-sm text-[var(--bp-muted)] mt-3">
              Welcome to your dashboard. Preparing your smart productivity plans...
            </p>
            <button
              onClick={() => {
                setIsSuccess(false)
                reset()
              }}
              className="mt-8 px-6 py-2.5 rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] hover:bg-[var(--bp-border)] text-xs font-semibold text-[var(--bp-text)] transition-colors"
            >
              Back to Auth Portal
            </button>
          </div>
        ) : (
          <div className="animate-scale-up">
            <BrandHeader />
            <div className="text-center mb-6">
              <h3 className="text-xl font-bold text-[var(--bp-text)]">
                {isSignUp ? 'Create your account' : 'Welcome back'}
              </h3>
              <p className="text-xs text-[var(--bp-muted)] mt-1.5 leading-relaxed">
                {isSignUp
                  ? 'Start organizing your reminders and plans with BeePlan.'
                  : 'Sign in to manage your reminders, tasks, and smart plans.'}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {isSignUp && (
                <AuthInput
                  label="Full Name"
                  placeholder="Alex Honeycomb"
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
                  error={errors.name}
                />
              )}
              <AuthInput
                label="Email Address"
                placeholder="name@example.com"
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
                error={errors.email}
              />
              <AuthInput
                label="Password"
                placeholder="Enter password"
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
                error={errors.password}
                rightSlot={
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="text-[9px] font-bold text-[var(--bp-muted)] hover:text-[var(--bp-text)] px-1"
                    >
                      {showPassword ? 'HIDE' : 'SHOW'}
                    </button>
                    {!isSignUp && (
                      <button
                        type="button"
                        onClick={onForgot}
                        className="text-[9px] font-bold text-[var(--bp-accent)] hover:underline whitespace-nowrap"
                      >
                        Forgot?
                      </button>
                    )}
                  </div>
                }
              />
              {isSignUp && password && (
                <p className="text-xs text-[var(--bp-muted)] pl-1 -mt-2">
                  Password strength: <span className="font-bold text-[var(--bp-text)]">{passwordStrength}</span>
                </p>
              )}
              {isSignUp && (
                <AuthInput
                  label="Confirm Password"
                  placeholder="Re-enter password"
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
                  error={errors.confirmPassword}
                />
              )}
              {(oauthError || submitError) && (
                <p className="text-red-400 text-xs pl-1">{oauthError || submitError}</p>
              )}
              {(oauthMessage || successMessage) && (
                <p className="text-emerald-400 text-xs pl-1">{oauthMessage || successMessage}</p>
              )}
              <div className="pt-1">
                <PrimaryButton loading={isLoading} disabled={isSubmitDisabled}>
                  {isSignUp ? 'Create Account' : 'Sign In'}
                </PrimaryButton>
              </div>
            </form>

            <div className="flex items-center my-5">
              <div className="flex-grow h-px bg-[var(--bp-border)]" />
              <span className="text-[9px] text-[var(--bp-muted)] uppercase tracking-wider font-semibold px-3">
                or continue with
              </span>
              <div className="flex-grow h-px bg-[var(--bp-border)]" />
            </div>

            <SocialLogin disabled={isLoading} onError={setSubmitError} />

            <AuthFooterLink
              prefix={isSignUp ? 'Already have an account?' : "Don't have an account?"}
              label={isSignUp ? 'Sign In' : 'Sign Up'}
              onClick={toggleMode}
            />
          </div>
        )}
      </AuthCard>
    </AuthShell>
  )
}

