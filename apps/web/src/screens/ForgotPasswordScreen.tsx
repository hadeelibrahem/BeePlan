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
          Reset access, continue <span className="text-[#FDEF4B] text-glow">planning smarter</span>.
        </>
      }
      sub="Secure your BeePlan workspace and get back to your reminders, tasks, and smart plans."
    >
      <AuthCard shake={shakeActive}>
        {sent ? (
          <div className="text-center py-2 animate-scale-up">
            <div className="w-16 h-16 rounded-full bg-[#FDEF4B]/10 border border-[#FDEF4B]/30 flex items-center justify-center mx-auto mb-5">
              <svg className="w-8 h-8 text-[#FDEF4B]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h3 className="text-2xl font-bold text-white tracking-tight">Check your email</h3>
            <p className="text-xs text-[#8C9BAE] mt-3 leading-relaxed max-w-xs mx-auto">
              We sent a password reset link to <span className="text-[#FDEF4B] font-semibold">{email}</span>.
              Open it to create a new password.
            </p>

            <div className="mt-6 space-y-3">
              <button
                type="button"
                onClick={onReset}
                className="w-full h-12 rounded-xl bg-[#FDEF4B] text-[#2B323F] text-xs font-bold uppercase tracking-wider hover:opacity-90 transition-all btn-glow"
              >
                Create New Password
              </button>
              <button
                type="button"
                onClick={() => {
                  setSent(false)
                  setEmail('')
                }}
                className="w-full h-12 rounded-xl border border-[#434D62] bg-[#2B323F] text-[#8C9BAE] text-xs font-semibold hover:bg-[#434D62] hover:text-white transition-all"
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
              <div className="w-12 h-12 rounded-2xl bg-[#FDEF4B]/10 border border-[#FDEF4B]/25 flex items-center justify-center">
                <svg className="w-6 h-6 text-[#FDEF4B]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" strokeLinecap="round" />
                </svg>
              </div>
            </div>

            <div className="text-center mb-6">
              <h3 className="text-xl font-bold text-white">Forgot Password?</h3>
              <p className="text-xs text-[#8C9BAE] mt-2 leading-relaxed">
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

              <p className="text-[10px] text-[#8C9BAE] leading-relaxed pt-0.5">
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
