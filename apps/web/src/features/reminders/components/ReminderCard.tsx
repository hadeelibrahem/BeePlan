import { useLanguage } from '../../../i18n/LanguageContext'
import type { Reminder } from '../types/reminders.types'
import { getLocationLabel } from '../utils/locationLabel'

const TYPE_META = {
  time: { icon: 'T', color: 'text-[var(--bp-accent)]', bg: 'bg-[var(--bp-accent)]/15', label: 'Time' },
  location: { icon: 'L', color: 'text-emerald-300', bg: 'bg-emerald-300/15', label: 'Location' },
  context: { icon: 'C', color: 'text-violet-300', bg: 'bg-violet-300/15', label: 'Context' },
  checklist: { icon: 'K', color: 'text-rose-300', bg: 'bg-rose-300/15', label: 'Checklist' },
}

const STATUS_BADGE: Record<Reminder['status'], string> = {
  active: 'border-emerald-400/35 bg-emerald-400/15 text-emerald-300',
  done: 'border-[var(--bp-border)] bg-[var(--bp-border)]/60 text-slate-400',
  missed: 'border-red-400/35 bg-red-400/15 text-red-300',
  snoozed: 'border-[var(--bp-accent)]/35 bg-[var(--bp-accent)]/15 text-[var(--bp-accent)]',
}

const priorityDot: Record<Reminder['priority'], string> = {
  low: 'bg-slate-400',
  medium: 'bg-[var(--bp-accent)]',
  high: 'bg-orange-400',
  urgent: 'bg-rose-400',
}

type Props = {
  reminder: Reminder
  onPress?: () => void
  onToggle?: () => void
}

export function ReminderCard({ reminder, onPress, onToggle }: Props) {
  const { formatPercent, t } = useLanguage()
  const meta = TYPE_META[reminder.type]
  const completed = reminder.status === 'done'

  const subtitle = getSubtitle(reminder)
  const progress =
    reminder.type === 'checklist' && reminder.checklistItems?.length
      ? reminder.checklistItems.filter((item) => item.isDone).length / reminder.checklistItems.length
      : null

  return (
    <article
      className={`relative animate-[beeplanFadeIn_300ms_ease-out] overflow-hidden rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] shadow-xl transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--bp-accent)]/40 ${
        completed ? 'opacity-60' : ''
      }`}
    >
      <div className="flex w-full items-start gap-3 px-4 py-4 text-start">
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            aria-label={completed ? t('actions.markActive') : t('actions.markComplete')}
            className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition ${
              completed
                ? 'border-[var(--bp-accent)] bg-[var(--bp-accent)]'
                : 'border-[var(--bp-border)] bg-[var(--bp-bg)] hover:border-[var(--bp-accent)]'
            }`}
          >
            {completed && <span className="h-2.5 w-2.5 rounded-full bg-black" />}
          </button>
        )}

        <button className="flex min-w-0 flex-1 items-start gap-3.5 text-start" onClick={onPress} type="button">
          <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${meta.bg}`}>
            <span className={`text-xs font-black ${meta.color}`}>{meta.icon}</span>
          </span>

          <span className="min-w-0 flex-1">
            <span className="mb-0.5 flex items-start gap-2">
              <span className={`flex-1 text-sm font-semibold leading-snug text-[var(--bp-text)] ${completed ? 'line-through' : ''}`}>
                {reminder.title}
              </span>
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${priorityDot[reminder.priority]}`} />
            </span>

            {subtitle && <span className="block truncate text-xs leading-snug text-slate-400">{subtitle}</span>}

            {progress !== null && (
              <span className="mt-2.5 flex items-center gap-2">
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--bp-bg)]">
                  <span
                    className="block h-full rounded-full bg-[var(--bp-accent)] transition-all duration-300"
                    style={{ width: `${progress * 100}%` }}
                  />
                </span>
                <span className="text-[11px] font-medium text-slate-400">
                  {formatPercent(Math.round(progress * 100))}
                </span>
              </span>
            )}

            <span className="mt-2 flex items-center gap-2">
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_BADGE[reminder.status]}`}
              >
                {t(`status.${reminder.status}`)}
              </span>
            </span>
          </span>

          <span className="mt-1 shrink-0 text-slate-500">&gt;</span>
        </button>
      </div>
    </article>
  )
}

function getSubtitle(reminder: Reminder) {
  if (reminder.type === 'time' && reminder.remindAt) return reminder.remindAt
  if (reminder.type === 'location' && reminder.location) {
    return `${reminder.location.trigger === 'arrive' ? 'Arriving at' : 'Leaving'} ${getLocationLabel(reminder.location)}`
  }
  if (reminder.type === 'checklist' && reminder.checklistItems) {
    const done = reminder.checklistItems.filter((item) => item.isDone).length
    return `${done}/${reminder.checklistItems.length} items completed`
  }
  if (reminder.type === 'context' && reminder.context) return reminder.context.condition
  return ''
}
