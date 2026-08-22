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
import { useLanguage } from '../i18n/LanguageContext'

export default function ForgotPasswordScreen({
  onBack,
}: {
  onBack: () => void
}) {
  const { t } = useLanguage()
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
      setError('auth.emailRequired')
      setShakeActive(true)
      setTimeout(() => setShakeActive(false), 500)
      return
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      setError('auth.emailInvalid')
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
      console.error('Unable to send password reset code', err)
      setSubmitError('auth.resetCodeSendFailed')
      setShakeActive(true)
      setTimeout(() => setShakeActive(false), 500)
    }
  }

  return (
    <AuthShell
      headline={
        <>
          {t('auth.resetAccessHeadline')} <span className="text-[var(--bp-accent-ink)] text-glow">{t('auth.planningSmarter')}</span>.
        </>
      }
      sub={t('auth.resetAccessDescription')}
    >
      <AuthCard shake={shakeActive}>
        {sent ? (
          <div className="text-center py-2 animate-scale-up">
            <div className="w-16 h-16 rounded-full bg-[var(--bp-accent)]/10 border border-[var(--bp-accent)]/30 flex items-center justify-center mx-auto mb-5">
              <svg className="w-8 h-8 text-[var(--bp-accent-ink)]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h3 className="text-2xl font-bold text-[var(--bp-text)] tracking-tight">{t('auth.checkEmail')}</h3>
            <p className="text-xs text-[var(--bp-muted)] mt-3 leading-relaxed max-w-xs mx-auto">
              {t('auth.resetCodeSent')}
            </p>

            <div className="mt-6 space-y-3">
              <button
                type="button"
                onClick={goToResetCode}
                className="w-full h-12 rounded-xl border border-[var(--bp-accent)] bg-[var(--bp-accent-soft)] text-[var(--bp-accent-ink)] text-xs font-bold uppercase tracking-wider hover:opacity-90 transition-all btn-glow"
              >
                {t('auth.enterResetCode')}
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
                {t('auth.sendAnotherCode')}
              </button>
            </div>

            <AuthFooterLink prefix={t('auth.rememberPassword')} label={t('auth.backToSignIn')} onClick={onBack} />
          </div>
        ) : (
          <div className="animate-scale-up">
            <BrandHeader />

            <div className="flex justify-center mb-5">
              <div className="w-12 h-12 rounded-2xl bg-[var(--bp-accent)]/10 border border-[var(--bp-accent)]/25 flex items-center justify-center">
                <svg className="w-6 h-6 text-[var(--bp-accent-ink)]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" strokeLinecap="round" />
                </svg>
              </div>
            </div>

            <div className="text-center mb-6">
              <h3 className="text-xl font-bold text-[var(--bp-text)]">{t('auth.forgotPasswordTitle')}</h3>
              <p className="text-xs text-[var(--bp-muted)] mt-2 leading-relaxed">
                {t('auth.forgotPasswordCodeSubtitle')}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <AuthInput
                label={t('auth.emailAddress')}
                placeholder={t('auth.emailPlaceholder')}
                value={email}
                onChange={(v) => {
                  setEmail(v)
                  setError('')
                  setSubmitError('')
                }}
                error={error ? t(error) : undefined}
              />

              <p className="text-[10px] text-[var(--bp-muted)] leading-relaxed pt-0.5">
                {t('auth.emailAccountHint', { brand_name: 'BeePlan' })}
              </p>

              <div className="pt-1">
                <PrimaryButton disabled={isLoading}>
                  {isLoading ? t('auth.sending') : t('auth.sendResetCode')}
                </PrimaryButton>
              </div>
              {submitError && <p className="text-red-400 text-xs ps-1">{t(submitError)}</p>}
            </form>

            <AuthFooterLink prefix={t('auth.rememberPassword')} label={t('auth.backToSignIn')} onClick={onBack} />
          </div>
        )}
      </AuthCard>
    </AuthShell>
  )
}
