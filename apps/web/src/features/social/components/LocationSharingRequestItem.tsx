import { DangerButton, OutlineButton, SecondaryButton } from '../../../components/layout'
import { useLanguage } from '../../../i18n/LanguageContext'
import type { LocationSharingPermission } from '../types/social.types'
import { FriendAvatar } from './FriendAvatar'
import { PermissionStatusBadge } from './PermissionStatusBadge'

type Props = {
  permission: LocationSharingPermission
  onApprove: (id: string) => void
  onReject: (id: string) => void
  onRevoke: (id: string) => void
}

/**
 * An incoming location-sharing request (the current user is the owner being
 * asked to share). Pending → Approve/Reject; active → Revoke.
 */
export function LocationSharingRequestItem({ permission, onApprove, onReject, onRevoke }: Props) {
  const { t } = useLanguage()
  const name = permission.friend?.fullName ?? t('people.sharing.aFriend')

  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--bp-border)] py-3 last:border-0">
      <div className="flex min-w-0 items-center gap-3">
        <FriendAvatar fullName={name} avatarUrl={permission.friend?.avatarUrl} size={36} />
        <div className="min-w-0">
          <p className="truncate text-sm text-[var(--bp-text)]">{name}</p>
          <PermissionStatusBadge status={permission.status} />
        </div>
      </div>

      {permission.status === 'pending' ? (
        <div className="flex gap-2">
          <SecondaryButton size="sm" onClick={() => onApprove(permission.id)}>
            {t('people.sharing.approve')}
          </SecondaryButton>
          <OutlineButton size="sm" onClick={() => onReject(permission.id)}>
            {t('people.sharing.reject')}
          </OutlineButton>
        </div>
      ) : permission.status === 'active' ? (
        <DangerButton size="sm" onClick={() => onRevoke(permission.id)}>
          {t('people.sharing.revoke')}
        </DangerButton>
      ) : null}
    </div>
  )
}
