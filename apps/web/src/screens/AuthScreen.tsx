import { useState, type FormEvent } from 'react'
import {
  AuthCard,
  AuthFooterLink,
  AuthInput,
  AuthShell,
  BrandHeader,
  PrimaryButton,
} from '../components/AuthShared'
import { signUp } from '../lib/api'
import {
  getPasswordStrength,
  hasNoErrors,
  validateSignIn,
  validateSignUp,
  type AuthErrors,
} from '../lib/authValidation'

export default function AuthScreen({ onForgot }: { onForgot: () => void }) {
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
    setSubmitError('')
    if (!validate()) {
      setShakeActive(true)
      setTimeout(() => setShakeActive(false), 500)
      return
    }
    setIsLoading(true)
    try {
      if (isSignUp) {
        await signUp({ fullName: name.trim(), email: email.trim(), password })
      } else {
        await new Promise((resolve) => setTimeout(resolve, 900))
      }
      setIsLoading(false)
      setIsSuccess(true)
    } catch (error) {
      setIsLoading(false)
      setSubmitError(
        error instanceof Error
          ? error.message
          : isSignUp
            ? 'Sign up failed. Please try again.'
            : 'Sign in failed. Please try again.',
      )
    }
  }

  const reset = () => {
    setName('')
    setEmail('')
    setPassword('')
    setConfirmPassword('')
    setErrors({})
    setSubmitError('')
  }
  const toggleMode = () => {
    setIsSignUp((s) => !s)
    reset()
  }

  return (
    <AuthShell
      headline={
        <>
          Organize reminders, tasks, and <span className="text-[#F5C542] text-glow">smart plans</span>.
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
            <h3 className="text-2xl font-bold text-white tracking-tight">Authentication Approved</h3>
            <p className="mt-3 text-sm text-[#A1A7B3]">
              Welcome to your dashboard. Preparing your smart productivity plans...
            </p>
            <button
              onClick={() => {
                setIsSuccess(false)
                reset()
              }}
              className="mt-8 rounded-xl border border-[#272D36] bg-[#15181E] px-6 py-2.5 text-xs font-semibold text-white transition-colors hover:border-[#F5C542]/50"
            >
              Back to Auth Portal
            </button>
          </div>
        ) : (
          <div className="animate-scale-up">
            <BrandHeader />
            <div className="text-center mb-6">
              <h3 className="text-xl font-bold text-white">
                {isSignUp ? 'Create your account' : 'Welcome back'}
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-[#A1A7B3]">
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
                }}
                error={errors.password}
                rightSlot={
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="px-1 text-[9px] font-bold text-[#A1A7B3] hover:text-white"
                    >
                      {showPassword ? 'HIDE' : 'SHOW'}
                    </button>
                    {!isSignUp && (
                      <button
                        type="button"
                        onClick={onForgot}
                        className="whitespace-nowrap text-[9px] font-bold text-[#F5C542] hover:underline"
                      >
                        Forgot?
                      </button>
                    )}
                  </div>
                }
              />
              {isSignUp && password && (
                <p className="-mt-2 pl-1 text-xs text-[#A1A7B3]">
                  Password strength: <span className="font-bold text-white">{passwordStrength}</span>
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
                  }}
                  error={errors.confirmPassword}
                />
              )}
              {submitError && <p className="text-red-400 text-xs pl-1">{submitError}</p>}
              <div className="pt-1">
                <PrimaryButton loading={isLoading} disabled={isSubmitDisabled}>
                  {isSignUp ? 'Create Account' : 'Sign In'}
                </PrimaryButton>
              </div>
            </form>

            <div className="flex items-center my-5">
              <div className="h-px flex-grow bg-[#272D36]" />
              <span className="px-3 text-[9px] font-semibold uppercase tracking-wider text-[#A1A7B3]">
                or continue with
              </span>
              <div className="h-px flex-grow bg-[#272D36]" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {['Google', 'Apple'].map((p) => (
                <button
                  key={p}
                  type="button"
                  className="flex h-11 items-center justify-center space-x-2 rounded-xl border border-[#272D36] bg-[#15181E] text-xs font-medium text-white transition-all hover:border-[#F5C542]/40 active:scale-[0.98]"
                >
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white text-[9px] font-black text-[#121820]">
                    {p === 'Google' ? 'G' : ''}
                  </span>
                  <span>{p}</span>
                </button>
              ))}
            </div>

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
