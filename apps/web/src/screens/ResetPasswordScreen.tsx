import { useState, type FormEvent } from 'react'
import {
  AuthCard,
  AuthFooterLink,
  AuthInput,
  AuthShell,
  BrandHeader,
  PrimaryButton,
} from '../components/AuthShared'

export default function ResetPasswordScreen({ onBack }: { onBack: () => void }) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<{ [k: string]: string }>({})
  const [isLoading, setIsLoading] = useState(false)
  const [shakeActive, setShakeActive] = useState(false)
  const [isDone, setIsDone] = useState(false)

  const strength = (() => {
    if (!password) return null
    if (password.length < 6) return { label: 'Weak', color: 'bg-red-500', w: 'w-1/3' }
    if (password.length < 10 || !/[A-Z]/.test(password) || !/\d/.test(password)) {
      return { label: 'Fair', color: 'bg-yellow-400', w: 'w-2/3' }
    }
    return { label: 'Strong', color: 'bg-emerald-400', w: 'w-full' }
  })()

  const handleSubmit = (ev: FormEvent) => {
    ev.preventDefault()
    const e: { [k: string]: string } = {}
    if (!password) e.password = 'Password is required'
    else if (password.length < 6) e.password = 'Password must be at least 6 characters'
    if (!confirmPassword) e.confirmPassword = 'Please confirm your password'
    else if (confirmPassword !== password) e.confirmPassword = 'Passwords do not match'
    if (Object.keys(e).length > 0) {
      setErrors(e)
      setShakeActive(true)
      setTimeout(() => setShakeActive(false), 500)
      return
    }
    setIsLoading(true)
    setTimeout(() => {
      setIsLoading(false)
      setIsDone(true)
    }, 1500)
  }

  const showHideBtn = (
    <button
      type="button"
      onClick={() => setShowPassword((s) => !s)}
      className="text-[9px] font-bold text-[#8C9BAE] hover:text-white px-1"
    >
      {showPassword ? 'HIDE' : 'SHOW'}
    </button>
  )

  return (
    <AuthShell
      headline={
        <>
          Secure your <span className="text-[#FDEF4B] text-glow">BeePlan workspace</span>.
        </>
      }
      sub="Set a strong new password to protect your reminders, tasks, and smart plans from unauthorised access."
    >
      <AuthCard shake={shakeActive}>
        {isDone ? (
          <div className="text-center py-2 animate-scale-up">
            <div className="w-20 h-20 flex items-center justify-center mx-auto mb-6">
              <svg className="success-circle-svg" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="40" fill="none" />
                <polyline points="30,52 45,65 70,38" fill="none" />
              </svg>
            </div>
            <h3 className="text-2xl font-bold text-white tracking-tight">Password Updated!</h3>
            <p className="text-xs text-[#8C9BAE] mt-3 leading-relaxed max-w-xs mx-auto">
              Your BeePlan password has been reset successfully. You can now sign in with your new password.
            </p>
            <button
              type="button"
              onClick={onBack}
              className="mt-8 w-full h-12 rounded-xl bg-[#FDEF4B] text-[#2B323F] text-xs font-bold uppercase tracking-wider hover:opacity-90 transition-all btn-glow"
            >
              Back to Sign In
            </button>
          </div>
        ) : (
          <div className="animate-scale-up">
            <BrandHeader />

            <div className="flex justify-center mb-5">
              <div className="w-12 h-12 rounded-2xl bg-[#FDEF4B]/10 border border-[#FDEF4B]/25 flex items-center justify-center">
                <svg className="w-6 h-6 text-[#FDEF4B]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path
                    d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>

            <div className="text-center mb-6">
              <h3 className="text-xl font-bold text-white">Create New Password</h3>
              <p className="text-xs text-[#8C9BAE] mt-2 leading-relaxed">
                Choose a strong password for your BeePlan account.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <AuthInput
                  label="New Password"
                  placeholder="Enter new password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(v) => {
                    setPassword(v)
                    setErrors((p) => ({ ...p, password: '' }))
                  }}
                  error={errors.password}
                  rightSlot={showHideBtn}
                />
                {strength && (
                  <div className="mt-2 space-y-1">
                    <div className="h-1 w-full bg-[#434D62] rounded-full overflow-hidden">
                      <div className={`h-full ${strength.color} ${strength.w} rounded-full transition-all duration-300`} />
                    </div>
                    <p className="text-[10px] text-[#8C9BAE]">
                      Strength: <span className="font-semibold text-white">{strength.label}</span>
                    </p>
                  </div>
                )}
              </div>

              <AuthInput
                label="Confirm New Password"
                placeholder="Re-enter new password"
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(v) => {
                  setConfirmPassword(v)
                  setErrors((p) => ({ ...p, confirmPassword: '' }))
                }}
                error={errors.confirmPassword}
                rightSlot={showHideBtn}
              />

              <div className="pt-1">
                <PrimaryButton loading={isLoading}>Reset Password</PrimaryButton>
              </div>
            </form>

            <AuthFooterLink prefix="Changed your mind?" label="Back to Sign In" onClick={onBack} />
          </div>
        )}
      </AuthCard>
    </AuthShell>
  )
}
