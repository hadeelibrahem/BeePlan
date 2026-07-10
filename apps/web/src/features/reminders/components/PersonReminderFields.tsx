import { useLanguage } from '../../../i18n/LanguageContext'
import { PermissionStatusBadge } from '../../social/components/PermissionStatusBadge'
import type { FriendSummary } from '../../social/types/social.types'
import type { PersonReminderConfig } from '../types/reminders.types'

type Props = {
  value: PersonReminderConfig
  onChange: (next: PersonReminderConfig) => void
  friends: FriendSummary[]
  onAddFriend?: () => void
}

const MIN_RADIUS = 20
const MAX_RADIUS = 1000

// Default 100, clamped to [20, 1000]; "020" → 20, junk → 100. Mirrors the
// backend normalization so the UI never lets an out-of-range radius through.
function normalizeRadius(value: string): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 100
  return Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, Math.round(parsed)))
}

function firstName(fullName: string): string {
  return fullName.split(' ')[0] ?? fullName
}

/**
 * Person ("when they're nearby") reminder fields. One shared component for
 * manual creation, AI text/voice prefill, and editing. Title + notes come from
 * the parent ReminderForm; this only owns the person-specific config plus the
 * friend-match / permission / confidence UI.
 */
export function PersonReminderFields({ value, onChange, friends, onAddFriend }: Props) {
  const { t } = useLanguage()

  const radius = value.radiusMeters ?? 100
  const selectedFriend =
    friends.find((f) => f.userId === value.targetUserId) ??
    value.candidates?.find((f) => f.userId === value.targetUserId) ??
    null

  const usedAi = typeof value.confidence === 'number'
  const unmatched =
    usedAi && !selectedFriend && (value.matchStatus === 'no_match' || value.matchStatus === 'needs_selection')

  const chooseFriend = (userId: string) =>
    onChange({ ...value, targetUserId: userId, matchStatus: 'matched' })

  return (
    <section className="grid gap-4">
      {/* AI confidence — only when the AI populated this reminder. */}
      {usedAi && (
        <div className="rounded-xl border border-[var(--bp-border)] bg-[var(--bp-bg)] p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-widest text-[var(--bp-subtle)]">
              {t('reminders.person.confidence')}
            </span>
            <span className="text-xs font-black text-[var(--bp-accent)]">
              {Math.round((value.confidence ?? 0) * 100)}%
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--bp-border)]">
            <div
              className="h-full rounded-full bg-[var(--bp-accent)] transition-all"
              style={{ width: `${Math.round((value.confidence ?? 0) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Friend selector */}
      <label className="block">
        <span className="mb-1.5 block text-xs font-black uppercase tracking-widest text-[var(--bp-subtle)]">
          {t('reminders.person.friend')}
        </span>
        {friends.length === 0 ? (
          <div className="rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-3">
            <p className="text-sm text-[var(--bp-muted)]">{t('reminders.person.noFriends')}</p>
            {onAddFriend && (
              <button
                type="button"
                onClick={onAddFriend}
                className="mt-2 rounded-lg bg-[var(--bp-accent)] px-3 py-1.5 text-xs font-black text-[var(--bp-accent-text)]"
              >
                {t('reminders.person.addFriend')}
              </button>
            )}
          </div>
        ) : (
          <select
            value={value.targetUserId ?? ''}
            onChange={(e) => chooseFriend(e.target.value)}
            className="w-full rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] px-3 py-2.5 text-sm text-[var(--bp-text)] outline-none transition focus:border-[var(--bp-accent)]"
          >
            <option value="">{t('reminders.person.selectFriend')}</option>
            {friends.map((f) => (
              <option key={f.userId} value={f.userId}>
                {f.fullName}
              </option>
            ))}
          </select>
        )}
      </label>

      {/* Unmatched-person state (AI couldn't confidently match). */}
      {unmatched && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3">
          <p className="mb-2 text-xs font-semibold text-amber-500">
            {value.matchStatus === 'no_match'
              ? t('reminders.person.noMatch', { name: value.aiPersonName || t('reminders.person.thatPerson') })
              : t('reminders.person.whichPerson', { name: value.aiPersonName || t('reminders.person.thatPerson') })}
          </p>
          <div className="flex flex-wrap gap-2">
            {(value.candidates && value.candidates.length > 0 ? value.candidates : friends).map((f) => (
              <button
                key={f.userId}
                type="button"
                onClick={() => chooseFriend(f.userId)}
                className="rounded-full border border-[var(--bp-border)] bg-[var(--bp-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--bp-text)] hover:border-[var(--bp-accent)]"
              >
                {f.fullName}
              </button>
            ))}
            {onAddFriend && (
              <button
                type="button"
                onClick={onAddFriend}
                className="rounded-full bg-[var(--bp-accent)] px-3 py-1.5 text-xs font-black text-[var(--bp-accent-text)]"
              >
                {t('reminders.person.addFriend')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Trigger — proximity only for now (enum kept open for arrive/leave later). */}
      <div>
        <span className="mb-1.5 block text-xs font-black uppercase tracking-widest text-[var(--bp-subtle)]">
          {t('reminders.person.trigger')}
        </span>
        <div className="rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] px-3 py-2.5 text-sm text-[var(--bp-text)]">
          {selectedFriend
            ? t('reminders.person.triggerNearbyNamed', { name: firstName(selectedFriend.fullName) })
            : t('reminders.person.triggerNearby')}
        </div>
      </div>

      {/* Radius */}
      <label className="block">
        <span className="mb-1.5 block text-xs font-black uppercase tracking-widest text-[var(--bp-subtle)]">
          {t('reminders.person.radius')}
        </span>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={MIN_RADIUS}
            max={MAX_RADIUS}
            value={radius}
            onChange={(e) => onChange({ ...value, radiusMeters: normalizeRadius(e.target.value) })}
            className="w-32 rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] px-3 py-2.5 text-sm text-[var(--bp-text)] outline-none transition focus:border-[var(--bp-accent)]"
          />
          <span className="text-sm text-[var(--bp-muted)]">{t('reminders.person.meters')}</span>
        </div>
      </label>

      {/* Permission status */}
      <div>
        <span className="mb-1.5 block text-xs font-black uppercase tracking-widest text-[var(--bp-subtle)]">
          {t('reminders.person.permission')}
        </span>
        {value.permissionStatus ? (
          <PermissionStatusBadge status={value.permissionStatus} />
        ) : (
          <p className="text-xs text-[var(--bp-muted)]">
            {selectedFriend
              ? t('reminders.person.willRequest', { name: firstName(selectedFriend.fullName) })
              : t('reminders.person.selectToContinue')}
          </p>
        )}
        <p className="mt-2 text-[11px] text-[var(--bp-subtle)]">{t('reminders.person.proximityNote')}</p>
      </div>
    </section>
  )
}
