import { useState, type FormEvent } from 'react'
import {
  AuthCard,
  AuthFooterLink,
  AuthInput,
  AuthShell,
  BrandHeader,
  PrimaryButton,
} from '../components/AuthShared'

export default function ForgotPasswordScreen({
  onBack,
  onReset,
}: {
  onBack: () => void
  onReset: () => void
}) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [shakeActive, setShakeActive] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = (ev: FormEvent) => {
    ev.preventDefault()
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
    setTimeout(() => {
      setIsLoading(false)
      setSent(true)
    }, 1500)
  }

  return (
    <AuthShell
      headline={
        <>
          Reset access, continue <span className="text-[#F5C542] text-glow">planning smarter</span>.
        </>
      }
      sub="Secure your BeePlan workspace and get back to your reminders, tasks, and smart plans."
    >
      <AuthCard shake={shakeActive}>
        {sent ? (
          <div className="text-center py-2 animate-scale-up">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-[#F5C542]/30 bg-[#F5C542]/10">
              <svg className="h-8 w-8 text-[#F5C542]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h3 className="text-2xl font-bold text-white tracking-tight">Check your email</h3>
            <p className="mx-auto mt-3 max-w-xs text-xs leading-relaxed text-[#A1A7B3]">
              We sent a password reset link to <span className="font-semibold text-[#F5C542]">{email}</span>.
              Open it to create a new password.
            </p>

            <div className="mt-6 space-y-3">
              <button
                type="button"
                onClick={onReset}
                className="h-12 w-full rounded-xl bg-[#F5C542] text-xs font-bold uppercase tracking-wider text-[#121820] transition-all hover:bg-[#FFD84A]"
              >
                Create New Password
              </button>
              <button
                type="button"
                onClick={() => {
                  setSent(false)
                  setEmail('')
                }}
                className="h-12 w-full rounded-xl border border-[#272D36] bg-[#15181E] text-xs font-semibold text-[#A1A7B3] transition-all hover:border-[#F5C542]/40 hover:text-white"
              >
                Resend Email
              </button>
            </div>

            <AuthFooterLink prefix="Remember your password?" label="Back to Sign In" onClick={onBack} />
          </div>
        ) : (
          <div className="animate-scale-up">
            <BrandHeader />

            <div className="flex justify-center mb-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#F5C542]/25 bg-[#F5C542]/10">
                <svg className="h-6 w-6 text-[#F5C542]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" strokeLinecap="round" />
                </svg>
              </div>
            </div>

            <div className="text-center mb-6">
              <h3 className="text-xl font-bold text-white">Forgot Password?</h3>
              <p className="mt-2 text-xs leading-relaxed text-[#A1A7B3]">
                Enter your email and we'll send you a reset link to get back into your account.
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
                }}
                error={error}
              />

              <p className="pt-0.5 text-[10px] leading-relaxed text-[#A1A7B3]">
                Make sure you enter the email associated with your BeePlan account.
              </p>

              <div className="pt-1">
                <PrimaryButton loading={isLoading}>Send Reset Link</PrimaryButton>
              </div>
            </form>

            <AuthFooterLink prefix="Remember your password?" label="Back to Sign In" onClick={onBack} />
          </div>
        )}
      </AuthCard>
    </AuthShell>
  )
}
