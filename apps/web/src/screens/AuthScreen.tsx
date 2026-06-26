import { useState, type FormEvent } from 'react'
import {
  AuthCard,
  AuthFooterLink,
  AuthInput,
  AuthShell,
  BrandHeader,
  PrimaryButton,
} from '../components/AuthShared'

export default function AuthScreen({ onForgot }: { onForgot: () => void }) {
  const [isSignUp, setIsSignUp] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<{ [k: string]: string }>({})
  const [isLoading, setIsLoading] = useState(false)
  const [shakeActive, setShakeActive] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  const validate = () => {
    const e: { [k: string]: string } = {}
    if (isSignUp && !name.trim()) e.name = 'Full name is required'
    if (!email.trim()) e.email = 'Email address is required'
    else if (!/\S+@\S+\.\S+/.test(email)) e.email = 'Please enter a valid email'
    if (!password) e.password = 'Password is required'
    else if (password.length < 6) e.password = 'Password must be at least 6 characters'
    if (isSignUp && !confirmPassword) e.confirmPassword = 'Please confirm your password'
    else if (isSignUp && confirmPassword !== password) e.confirmPassword = 'Passwords do not match'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = (ev: FormEvent) => {
    ev.preventDefault()
    if (!validate()) {
      setShakeActive(true)
      setTimeout(() => setShakeActive(false), 500)
      return
    }
    setIsLoading(true)
    setTimeout(() => {
      setIsLoading(false)
      setIsSuccess(true)
    }, 1500)
  }

  const reset = () => {
    setName('')
    setEmail('')
    setPassword('')
    setConfirmPassword('')
    setErrors({})
  }
  const toggleMode = () => {
    setIsSignUp((s) => !s)
    reset()
  }

  return (
    <AuthShell
      headline={
        <>
          Organize reminders, tasks, and <span className="text-[#FDEF4B] text-glow">smart plans</span>.
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
            <p className="text-sm text-[#8C9BAE] mt-3">
              Welcome to your dashboard. Preparing your smart productivity plans...
            </p>
            <button
              onClick={() => {
                setIsSuccess(false)
                reset()
              }}
              className="mt-8 px-6 py-2.5 rounded-xl border border-[#434D62] bg-[#2B323F] hover:bg-[#434D62] text-xs font-semibold text-white transition-colors"
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
              <p className="text-xs text-[#8C9BAE] mt-1.5 leading-relaxed">
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
                    setErrors((p) => ({ ...p, name: '' }))
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
                  setErrors((p) => ({ ...p, email: '' }))
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
                  setErrors((p) => ({ ...p, password: '' }))
                }}
                error={errors.password}
                rightSlot={
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="text-[9px] font-bold text-[#8C9BAE] hover:text-white px-1"
                    >
                      {showPassword ? 'HIDE' : 'SHOW'}
                    </button>
                    {!isSignUp && (
                      <button
                        type="button"
                        onClick={onForgot}
                        className="text-[9px] font-bold text-[#FDEF4B] hover:underline whitespace-nowrap"
                      >
                        Forgot?
                      </button>
                    )}
                  </div>
                }
              />
              {isSignUp && (
                <AuthInput
                  label="Confirm Password"
                  placeholder="Re-enter password"
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(v) => {
                    setConfirmPassword(v)
                    setErrors((p) => ({ ...p, confirmPassword: '' }))
                  }}
                  error={errors.confirmPassword}
                />
              )}
              <div className="pt-1">
                <PrimaryButton loading={isLoading}>{isSignUp ? 'Create Account' : 'Sign In'}</PrimaryButton>
              </div>
            </form>

            <div className="flex items-center my-5">
              <div className="flex-grow h-px bg-[#434D62]" />
              <span className="text-[9px] text-[#8C9BAE] uppercase tracking-wider font-semibold px-3">
                or continue with
              </span>
              <div className="flex-grow h-px bg-[#434D62]" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {['Google', 'Apple'].map((p) => (
                <button
                  key={p}
                  type="button"
                  className="h-11 bg-[#2B323F] hover:bg-[#434D62] border border-[#434D62] rounded-xl flex items-center justify-center space-x-2 transition-all text-white font-medium text-xs active:scale-[0.98]"
                >
                  <span className="w-4 h-4 rounded-full bg-white text-[#2B323F] font-black text-[9px] flex items-center justify-center">
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
