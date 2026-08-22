import type { TaskRole } from '../types'
import { useLanguage } from '../../../i18n/LanguageContext'

type SharedBadgeProps = { memberCount?: number; className?: string }
export function SharedBadge({ memberCount, className = '' }: SharedBadgeProps) {
  const { t } = useLanguage()
  return <span className={`inline-flex items-center gap-1 rounded-full border border-[var(--bp-accent)]/30 bg-[var(--bp-accent)]/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[var(--bp-accent-ink)] ${className}`} aria-label={memberCount ? t('collaborationMembers.memberCount', { count: memberCount }) : t('collaborationMembers.title')}><span aria-hidden>👥</span>{t('collaborationMembers.title')}{memberCount ? <span className="opacity-80">· {memberCount}</span> : null}</span>
}

type RoleBadgeProps = { role: TaskRole; className?: string }
export function RoleBadge({ role, className = '' }: RoleBadgeProps) {
  const { t } = useLanguage()
  const icon = role === 'owner' ? '👑' : role === 'editor' ? '✏️' : '👁️'
  return <span className={`inline-flex items-center gap-1 rounded-full border border-[var(--bp-border)] bg-[var(--bp-surface)] px-2 py-0.5 text-[10px] font-bold text-[var(--bp-text)] ${className}`}><span aria-hidden>{icon}</span>{t(`collaborationMembers.${role}`)}</span>
}
