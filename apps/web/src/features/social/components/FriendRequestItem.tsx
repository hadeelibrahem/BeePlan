import { OutlineButton, SecondaryButton } from '../../../components/layout'
import { useLanguage } from '../../../i18n/LanguageContext'
import type { FriendRequest } from '../types/social.types'
import { FriendAvatar } from './FriendAvatar'

type IncomingProps = {
  request: FriendRequest
  direction: 'incoming'
  onAccept: (id: string) => void
  onDecline: (id: string) => void
}

type OutgoingProps = {
  request: FriendRequest
  direction: 'outgoing'
  onCancel: (id: string) => void
}

type Props = IncomingProps | OutgoingProps

/** One friend-request row. Incoming shows Accept/Decline; outgoing shows Pending/Cancel. */
export function FriendRequestItem(props: Props) {
  const { t } = useLanguage()
  const { request } = props

  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--bp-border)] py-3 last:border-0">
      <div className="flex min-w-0 items-center gap-3">
        <FriendAvatar fullName={request.user.fullName} avatarUrl={request.user.avatarUrl} size={36} />
        <div className="min-w-0">
          <p className="truncate text-sm text-[var(--bp-text)]">{request.user.fullName}</p>
          <p className="truncate text-[11px] text-slate-400">{request.user.email}</p>
        </div>
      </div>

      {props.direction === 'incoming' ? (
        <div className="flex gap-2">
          <SecondaryButton size="sm" onClick={() => props.onAccept(request.id)}>
            {t('people.requests.accept')}
          </SecondaryButton>
          <OutlineButton size="sm" onClick={() => props.onDecline(request.id)}>
            {t('people.requests.decline')}
          </OutlineButton>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-amber-500">{t('people.requests.pending')}</span>
          <OutlineButton size="sm" onClick={() => props.onCancel(request.id)}>
            {t('people.requests.cancel')}
          </OutlineButton>
        </div>
      )}
    </div>
  )
}
