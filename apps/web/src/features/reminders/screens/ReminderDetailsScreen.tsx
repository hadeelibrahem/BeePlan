import { useLanguage } from '../../../i18n/LanguageContext'
import type { Reminder } from '../types/reminders.types'
import { getLocationLabel } from '../utils/locationLabel'

type Props = {
  reminder: Reminder
  onBack: () => void
  onEdit: () => void
}

export function ReminderDetailsScreen({ reminder, onBack, onEdit }: Props) {
  const { t, isRTL } = useLanguage()

  return (
    <main className="min-h-screen bg-[var(--bp-bg)] px-4 pb-8 pt-5 text-[var(--bp-text)]">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              aria-label={t('actions.back')}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--bp-border)] bg-[var(--bp-surface)] text-lg font-black text-[var(--bp-accent)] transition hover:border-[var(--bp-accent)]"
            >
              {isRTL ? '>' : '<'}
            </button>
            <span className="text-sm font-bold text-[var(--bp-muted)]">{t('actions.back')}</span>
          </div>
          <button type="button" onClick={onEdit} className="rounded-full border border-[var(--bp-accent)] bg-[var(--bp-accent-soft)] px-5 py-3 text-xs font-black text-[var(--bp-accent)] transition hover:brightness-95">
            {t('actions.edit')}
          </button>
        </div>
        <section className="rounded-[24px] border border-[var(--bp-border)] bg-[var(--bp-surface)] p-6">
          <p className="text-xs font-black uppercase tracking-widest text-[var(--bp-accent)]">
            {t('reminders.typeReminder', { type: t(`filters.${reminder.type}`) })}
          </p>
          <h1 className="mt-3 text-4xl font-black">{reminder.title}</h1>
          {reminder.description && <p className="mt-3 text-base leading-7 text-[var(--bp-muted)]">{reminder.description}</p>}
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Detail label={t('reminders.detailStatus')} value={t(`status.${reminder.status}`)} />
            <Detail label={t('reminders.detailPriority')} value={reminder.priority} />
            {reminder.remindAt && <Detail label={t('reminders.detailWhen')} value={reminder.remindAt} />}
            {reminder.location && (
              <Detail
                label={t('reminders.detailLocation')}
                value={`${reminder.location.trigger} ${getLocationLabel(reminder.location)}, ${reminder.location.radiusMeters}m`}
              />
            )}
            {reminder.context && <Detail label={t('reminders.detailCondition')} value={reminder.context.condition} />}
          </div>
        </section>
        {!!reminder.checklistItems?.length && (
          <section className="mt-5 rounded-[24px] border border-[var(--bp-border)] bg-[var(--bp-surface)] p-5">
            <h2 className="mb-4 text-xl font-black">{t('reminders.checklist')}</h2>
            <div className="grid gap-3">
              {reminder.checklistItems.map((item) => (
                <div key={item.id} className="flex items-center gap-3">
                  <span className={`h-5 w-5 rounded-full ${item.isDone ? 'bg-[var(--bp-accent)]' : 'border border-[var(--bp-subtle)]'}`} />
                  <span className="text-sm font-semibold text-[var(--bp-muted)]">{item.title}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-input)] p-4">
      <p className="text-xs font-black uppercase tracking-widest text-[var(--bp-subtle)]">{label}</p>
      <p className="mt-1 text-sm font-bold text-[var(--bp-text)]">{value}</p>
    </div>
  )
}
