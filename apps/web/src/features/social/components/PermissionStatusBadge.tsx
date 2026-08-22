import type { PermissionStatus } from '../types/social.types'
import { useLanguage } from '../../../i18n/LanguageContext'

// The four user-facing states the spec calls for, plus rejected. Each maps a
// backend status to a human label and a themed color.
const STATUS_META: Record<PermissionStatus, { key: string; className: string }> = {
  pending: {
    key: 'waiting',
    className: 'bg-amber-400/15 text-amber-500 border-amber-400/30',
  },
  active: {
    key: 'active',
    className: 'bg-emerald-400/15 text-emerald-500 border-emerald-400/30',
  },
  expired: {
    key: 'permissionExpired',
    className: 'bg-slate-400/15 text-[var(--bp-muted)] border-slate-400/30',
  },
  revoked: {
    key: 'permissionRevoked',
    className: 'bg-rose-400/15 text-rose-500 border-rose-400/30',
  },
  rejected: {
    key: 'requestDeclined',
    className: 'bg-rose-400/15 text-rose-500 border-rose-400/30',
  },
}

export function PermissionStatusBadge({ status }: { status: PermissionStatus }) {
  const { t } = useLanguage()
  const meta = STATUS_META[status] ?? STATUS_META.pending
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${meta.className}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {t(`people.status.${meta.key}`)}
    </span>
  )
}
