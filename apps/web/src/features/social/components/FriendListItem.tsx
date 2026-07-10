import { DangerButton } from '../../../components/layout'
import { useLanguage } from '../../../i18n/LanguageContext'
import type { FriendSummary } from '../types/social.types'
import { FriendAvatar } from './FriendAvatar'

type Props = {
  friend: FriendSummary
  onRemove: (friend: FriendSummary) => void
  /** Future friend-detail seam. When omitted the row isn't clickable. */
  onSelect?: (friend: FriendSummary) => void
}

/** A single friend row: avatar, name, email, and a remove action. */
export function FriendListItem({ friend, onRemove, onSelect }: Props) {
  const { t } = useLanguage()
  const clickable = Boolean(onSelect)

  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--bp-border)] py-3 last:border-0">
      <button
        type="button"
        disabled={!clickable}
        onClick={() => onSelect?.(friend)}
        className={`flex flex-1 items-center gap-3 text-start ${clickable ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <FriendAvatar fullName={friend.fullName} avatarUrl={friend.avatarUrl} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-[var(--bp-text)]">{friend.fullName}</span>
          <span className="block truncate text-[11px] text-slate-400">{friend.email}</span>
        </span>
      </button>
      <DangerButton size="sm" onClick={() => onRemove(friend)}>
        {t('people.friends.remove')}
      </DangerButton>
    </div>
  )
}
