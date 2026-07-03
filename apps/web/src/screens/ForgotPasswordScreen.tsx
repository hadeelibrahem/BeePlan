import { useState, type FormEvent } from 'react'
import {
  AuthCard,
  AuthFooterLink,
  AuthInput,
  AuthShell,
  BrandHeader,
  PrimaryButton,
} from '../components/AuthShared'
import { useAuth } from '../hooks/useAuth'

export default function ForgotPasswordScreen({
  onBack,
}: {
  onBack: () => void
}) {
  const { sendPasswordReset } = useAuth()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [shakeActive, setShakeActive] = useState(false)
  const [sent, setSent] = useState(false)

  const goToResetCode = () => {
    window.history.pushState(null, '', '/reset-password')
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  const handleSubmit = async (ev: FormEvent) => {
    ev.preventDefault()
    setSubmitError('')
    if (!email.trim()) {
      setError('Email address is required')
      setShakeActive(true)
      setTimeout(() => setShakeActive(false), 500)
      return
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      setError('Please enter a valid email')
      setShakeActive(true)
      setTimeout(() => setShakeActive(false), 500)
      return
    }
    setIsLoading(true)
    try {
      const devResetCode = await sendPasswordReset(email)
      window.sessionStorage.setItem('beeplan_reset_email', email.trim())
      if (devResetCode) {
        window.sessionStorage.setItem('beeplan_reset_dev_code', devResetCode)
      } else {
        window.sessionStorage.removeItem('beeplan_reset_dev_code')
      }
      setIsLoading(false)
      goToResetCode()
    } catch (err) {
      setIsLoading(false)
      const message = err instanceof Error ? err.message : ''
      setSubmitError(message || 'Unable to send reset code. Please try again.')
      setShakeActive(true)
      setTimeout(() => setShakeActive(false), 500)
    }
  }

  return (
    <AuthShell
      headline={
        <>
          Reset access, continue <span className="text-[var(--bp-accent)] text-glow">planning smarter</span>.
        </>
      }
      sub="Secure your BeePlan workspace and get back to your reminders, tasks, and smart plans."
    >
      <AuthCard shake={shakeActive}>
        {sent ? (
          <div className="text-center py-2 animate-scale-up">
            <div className="w-16 h-16 rounded-full bg-[var(--bp-accent)]/10 border border-[var(--bp-accent)]/30 flex items-center justify-center mx-auto mb-5">
              <svg className="w-8 h-8 text-[var(--bp-accent)]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h3 className="text-2xl font-bold text-[var(--bp-text)] tracking-tight">Check your email</h3>
            <p className="text-xs text-[var(--bp-muted)] mt-3 leading-relaxed max-w-xs mx-auto">
              We sent a 6-digit reset code. Enter it to create a new password.
            </p>

            <div className="mt-6 space-y-3">
              <button
                type="button"
                onClick={goToResetCode}
                className="w-full h-12 rounded-xl bg-[var(--bp-accent)] text-[var(--bp-accent-text)] text-xs font-bold uppercase tracking-wider hover:opacity-90 transition-all btn-glow"
              >
                Enter Reset Code
              </button>
              <button
                type="button"
                onClick={() => {
                  setSent(false)
                  setEmail('')
                  setSubmitError('')
                }}
                className="w-full h-12 rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] text-[var(--bp-muted)] text-xs font-semibold hover:bg-[var(--bp-border)] hover:text-[var(--bp-text)] transition-all"
              >
                Send Another Code
              </button>
            </div>

            <AuthFooterLink prefix="Remember your password?" label="Back to Sign In" onClick={onBack} />
          </div>
        ) : (
          <div className="animate-scale-up">
            <BrandHeader />

            <div className="flex justify-center mb-5">
              <div className="w-12 h-12 rounded-2xl bg-[var(--bp-accent)]/10 border border-[var(--bp-accent)]/25 flex items-center justify-center">
                <svg className="w-6 h-6 text-[var(--bp-accent)]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" strokeLinecap="round" />
                </svg>
              </div>
            </div>

            <div className="text-center mb-6">
              <h3 className="text-xl font-bold text-[var(--bp-text)]">Forgot Password?</h3>
              <p className="text-xs text-[var(--bp-muted)] mt-2 leading-relaxed">
                Enter your email and we'll send you a reset code to get back into your account.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <AuthInput
                label="Email Address"
                placeholder="name@example.com"
                value={email}
                onChange={(v) => {
                  setEmail(v)
                  setError('')
                  setSubmitError('')
                }}
                error={error}
              />

              <p className="text-[10px] text-[var(--bp-muted)] leading-relaxed pt-0.5">
                Make sure you enter the email associated with your BeePlan account.
              </p>

              <div className="pt-1">
                <PrimaryButton disabled={isLoading}>
                  {isLoading ? 'Sending...' : 'Send Reset Code'}
                </PrimaryButton>
              </div>
              {submitError && <p className="text-red-400 text-xs ps-1">{submitError}</p>}
            </form>

            <AuthFooterLink prefix="Remember your password?" label="Back to Sign In" onClick={onBack} />
          </div>
        )}
      </AuthCard>
    </AuthShell>
  )
}
