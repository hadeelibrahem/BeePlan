import { useEffect, useState, type FormEvent } from 'react'
import {
  AuthCard,
  AuthFooterLink,
  AuthInput,
  AuthShell,
  BrandHeader,
  PrimaryButton,
} from '../components/AuthShared'
import { useAuth } from '../hooks/useAuth'
import { useLanguage } from '../i18n/LanguageContext'

export default function ResetPasswordScreen({ onBack }: { onBack: () => void }) {
  const { t } = useLanguage()
  const { updatePassword, verifyRecoveryCode } = useAuth()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [codeVerified, setCodeVerified] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<{ [k: string]: string }>({})
  const [isLoading, setIsLoading] = useState(false)
  const [shakeActive, setShakeActive] = useState(false)
  const [isDone, setIsDone] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [devResetCode, setDevResetCode] = useState('')

  useEffect(() => {
    const storedDevCode = window.sessionStorage.getItem('beeplan_reset_dev_code') ?? ''

    setEmail(window.sessionStorage.getItem('beeplan_reset_email') ?? '')
    setDevResetCode(storedDevCode)
    if (storedDevCode) {
      setCode(storedDevCode)
    }
  }, [])

  const strength = (() => {
    if (!password) return null
    if (password.length < 6) return { label: 'Weak', color: 'bg-red-500', w: 'w-1/3' }
    if (password.length < 10 || !/[A-Z]/.test(password) || !/\d/.test(password)) {
      return { label: 'Fair', color: 'bg-[var(--bp-accent)]', w: 'w-2/3' }
    }
    return { label: 'Strong', color: 'bg-emerald-400', w: 'w-full' }
  })()

  const handleVerifyCode = async (ev: FormEvent) => {
    ev.preventDefault()
    const e: { [k: string]: string } = {}
    setSubmitError('')

    if (!email.trim()) e.email = 'auth.emailRequired'
    else if (!/\S+@\S+\.\S+/.test(email)) e.email = 'auth.emailInvalid'
    if (!code.trim()) e.code = 'auth.resetCodeRequired'

    if (Object.keys(e).length > 0) {
      setErrors(e)
      setShakeActive(true)
      setTimeout(() => setShakeActive(false), 500)
      return
    }

    setIsLoading(true)
    try {
      await verifyRecoveryCode(email, code)
      window.sessionStorage.setItem('beeplan_reset_email', email.trim())
      setCodeVerified(true)
      setErrors({})
      setIsLoading(false)
    } catch (err) {
      setIsLoading(false)
      console.error('Unable to verify password reset code', err)
      setSubmitError('auth.resetCodeInvalid')
      setShakeActive(true)
      setTimeout(() => setShakeActive(false), 500)
    }
  }

  const handleSubmit = async (ev: FormEvent) => {
    ev.preventDefault()
    const e: { [k: string]: string } = {}
    setSubmitError('')
    if (!password) e.password = 'auth.passwordRequired'
    else if (password.length < 8) e.password = 'auth.passwordMinimum'
    if (!confirmPassword) e.confirmPassword = 'auth.confirmPasswordRequired'
    else if (confirmPassword !== password) e.confirmPassword = 'auth.passwordsDoNotMatch'
    if (Object.keys(e).length > 0) {
      setErrors(e)
      setShakeActive(true)
      setTimeout(() => setShakeActive(false), 500)
      return
    }
    setIsLoading(true)
    try {
      await updatePassword(password)
      window.sessionStorage.removeItem('beeplan_reset_email')
      window.sessionStorage.removeItem('beeplan_reset_dev_code')
      setIsLoading(false)
      setIsDone(true)
      setTimeout(() => {
        window.history.pushState(null, '', '/sign-in')
        window.dispatchEvent(new PopStateEvent('popstate'))
      }, 1200)
    } catch (err) {
      setIsLoading(false)
      console.error('Unable to update password', err)
      setSubmitError('auth.passwordUpdateFailed')
    }
  }

  const showHideBtn = (
    <button
      type="button"
      onClick={() => setShowPassword((s) => !s)}
      className="text-[9px] font-bold text-[var(--bp-muted)] hover:text-[var(--bp-text)] px-1"
    >
      {showPassword ? t('common.hide') : t('common.show')}
    </button>
  )

  return (
    <AuthShell
      headline={
        <>
          {t('auth.secureYour')} <span className="text-[var(--bp-accent-ink)] text-glow">{t('auth.beePlanWorkspace')}</span>.
        </>
      }
      sub={t('auth.securePasswordDescription')}
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
            <h3 className="text-2xl font-bold text-[var(--bp-text)] tracking-tight">{t('auth.passwordUpdated')}</h3>
            <p className="text-xs text-[var(--bp-muted)] mt-3 leading-relaxed max-w-xs mx-auto">
              {t('auth.passwordResetOpening', { brand_name: 'BeePlan' })}
            </p>
            <button
              type="button"
              onClick={onBack}
              className="mt-8 w-full h-12 rounded-xl border border-[var(--bp-accent)] bg-[var(--bp-accent-soft)] text-[var(--bp-accent-ink)] text-xs font-bold uppercase tracking-wider hover:opacity-90 transition-all btn-glow"
            >
              {t('auth.openBeePlan')}
            </button>
          </div>
        ) : (
          <div className="animate-scale-up">
            <BrandHeader />

            <div className="flex justify-center mb-5">
              <div className="w-12 h-12 rounded-2xl bg-[var(--bp-accent)]/10 border border-[var(--bp-accent)]/25 flex items-center justify-center">
                <svg className="w-6 h-6 text-[var(--bp-accent-ink)]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path
                    d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>

            <div className="text-center mb-6">
              <h3 className="text-xl font-bold text-[var(--bp-text)]">
                {codeVerified ? t('auth.createNewPassword') : t('auth.enterResetCode')}
              </h3>
              <p className="text-xs text-[var(--bp-muted)] mt-2 leading-relaxed">
                {codeVerified
                  ? t('auth.chooseStrongPassword', { brand_name: 'BeePlan' })
                  : t('auth.enterCodeInstruction')}
              </p>
            </div>

            {codeVerified ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <AuthInput
                    label={t('auth.newPassword')}
                    placeholder={t('auth.newPasswordPlaceholder')}
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(v) => {
                      setPassword(v)
                      setErrors((p) => ({ ...p, password: '' }))
                      setSubmitError('')
                    }}
                    error={errors.password ? t(errors.password) : undefined}
                    rightSlot={showHideBtn}
                  />
                  {strength && (
                    <div className="mt-2 space-y-1">
                      <div className="h-1 w-full bg-[var(--bp-border)] rounded-full overflow-hidden">
                        <div className={`h-full ${strength.color} ${strength.w} rounded-full transition-all duration-300`} />
                      </div>
                      <p className="text-[10px] text-[var(--bp-muted)]">
                        {t('auth.strength', { strength: t(`auth.${strength.label.toLowerCase()}`) })}
                      </p>
                    </div>
                  )}
                </div>

                <AuthInput
                  label={t('auth.confirmNewPassword')}
                  placeholder={t('auth.confirmPasswordPlaceholder')}
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(v) => {
                    setConfirmPassword(v)
                    setErrors((p) => ({ ...p, confirmPassword: '' }))
                    setSubmitError('')
                  }}
                  error={errors.confirmPassword ? t(errors.confirmPassword) : undefined}
                  rightSlot={showHideBtn}
                />

                <div className="pt-1">
                  <PrimaryButton loading={isLoading} disabled={isLoading}>
                    {isLoading ? t('auth.updating') : t('auth.updatePassword')}
                  </PrimaryButton>
                </div>
                {submitError && <p className="text-red-400 text-xs ps-1">{t(submitError)}</p>}
              </form>
            ) : (
              <form onSubmit={handleVerifyCode} className="space-y-4">
                <AuthInput
                  label={t('auth.emailAddress')}
                  placeholder={t('auth.emailPlaceholder')}
                  value={email}
                  onChange={(v) => {
                    setEmail(v)
                    setErrors((p) => ({ ...p, email: '' }))
                    setSubmitError('')
                  }}
                  error={errors.email ? t(errors.email) : undefined}
                />

                <AuthInput
                  label={t('auth.resetCode')}
                  placeholder={t('auth.resetCodePlaceholder')}
                  value={code}
                  onChange={(v) => {
                    setCode(v)
                    setErrors((p) => ({ ...p, code: '' }))
                    setSubmitError('')
                  }}
                  error={errors.code ? t(errors.code) : undefined}
                />
                {devResetCode && (
                  <p className="text-[var(--bp-accent-ink)] text-xs ps-1">
                    {t('auth.developmentCode')} <span className="font-bold tracking-widest" dir="ltr">{devResetCode}</span>
                  </p>
                )}

                <div className="pt-1">
                  <PrimaryButton loading={isLoading} disabled={isLoading}>
                    {isLoading ? t('auth.checking') : t('auth.verifyCode')}
                  </PrimaryButton>
                </div>
                {submitError && <p className="text-red-400 text-xs ps-1">{t(submitError)}</p>}
              </form>
            )}

            <AuthFooterLink prefix={t('auth.changedMind')} label={t('auth.backToSignIn')} onClick={onBack} />
          </div>
        )}
      </AuthCard>
    </AuthShell>
  )
}
