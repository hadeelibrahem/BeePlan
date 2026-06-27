import { useLanguage } from './LanguageContext'

export function LanguageToggle() {
  const { t, toggleLanguage } = useLanguage()

  return (
    <button
      type="button"
      onClick={toggleLanguage}
      aria-label={t('actions.switchLanguage')}
      className="flex h-10 items-center justify-center rounded-full border border-[var(--bp-border)] bg-[var(--bp-surface)] px-3 text-xs font-black text-[var(--bp-text)] transition hover:border-[var(--bp-accent)] sm:h-12"
    >
      {t('common.languageToggle')}
    </button>
  )
}
