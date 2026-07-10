import { useLanguage } from '../../../i18n/LanguageContext'
import type { LocationSharingPermission } from '../types/social.types'
import { FriendAvatar } from './FriendAvatar'
import { PermissionStatusBadge } from './PermissionStatusBadge'

type Props = {
  permission: LocationSharingPermission
}

function formatDate(iso: string, locale: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' })
}

/**
 * Read-only summary of a single permission for the "My Permissions" section:
 * friend, status, radius (outgoing only), and last activity.
 */
export function PermissionCard({ permission }: Props) {
  const { t, isRTL } = useLanguage()
  const name = permission.friend?.fullName ?? t('people.sharing.aFriend')
  const locale = isRTL ? 'ar' : 'en'

  return (
    <div className="rounded-xl border border-[var(--bp-border)] bg-[var(--bp-bg)] p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <FriendAvatar fullName={name} avatarUrl={permission.friend?.avatarUrl} size={32} />
          <span className="truncate text-sm font-semibold text-[var(--bp-text)]">{name}</span>
        </div>
        <PermissionStatusBadge status={permission.status} />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
        {permission.radiusMeters != null && (
          <span>
            {t('people.permissions.radius')}: {permission.radiusMeters} {t('reminders.person.meters')}
          </span>
        )}
        <span>
          {t('people.permissions.lastActivity')}: {formatDate(permission.lastActivityAt, locale)}
        </span>
      </div>
    </div>
  )
}
