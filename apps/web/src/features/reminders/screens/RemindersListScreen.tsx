import { useState } from 'react'
import BeePlanLogo from '../../../components/BeePlanLogo'
import { useLanguage } from '../../../i18n/LanguageContext'
import { LanguageToggle } from '../../../i18n/LanguageToggle'
import { useTheme } from '../../../theme/ThemeContext'
import { ReminderCard } from '../components/ReminderCard'
import type { Reminder, ReminderType } from '../types/reminders.types'

type FilterTab = 'all' | ReminderType | 'completed'

type Props = {
  reminders: Reminder[]
  onSelect: (id: string) => void
  onCreate: () => void
  onToggle: (id: string) => void
}

export function RemindersListScreen({ reminders, onSelect, onCreate, onToggle }: Props) {
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  const { formatNumber, t } = useLanguage()
  const { mode, toggleTheme } = useTheme()

  const tabs: FilterTab[] = ['all', 'time', 'location', 'checklist', 'context', 'completed']

  const filtered = reminders.filter((reminder) => {
    const matchSearch =
      !search ||
      reminder.title.toLowerCase().includes(search.toLowerCase()) ||
      reminder.description?.toLowerCase().includes(search.toLowerCase())

    const matchTab =
      activeTab === 'all'
        ? reminder.status !== 'done'
        : activeTab === 'completed'
          ? reminder.status === 'done'
          : reminder.type === activeTab && reminder.status !== 'done'

    return matchSearch && matchTab
  })

  const activeCount = reminders.filter((reminder) => reminder.status === 'active').length

  return (
    <div className="min-h-[calc(100vh-48px)] rounded-[28px] border border-[var(--bp-border)] bg-[var(--bp-bg)] shadow-2xl shadow-[var(--bp-shadow)] transition-colors duration-200">
      <div className="bg-[var(--bp-bg)] px-5 pb-4 pt-6 transition-colors duration-200 sm:px-8 sm:pt-8">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <div className="mb-0.5 flex items-center gap-2">
              <BeePlanLogo size={28} iconOnly />
              <h1 className="text-xl font-bold tracking-tight text-[var(--bp-text)]">{t('common.brand_name')}</h1>
            </div>
            <p className="text-xs text-[var(--bp-subtle)]">
              {t('dashboard.activeReminders', {
                count: formatNumber(activeCount),
                plural: activeCount === 1 ? '' : 's',
              })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onCreate}
              className="hidden h-10 items-center justify-center gap-2 rounded-full bg-[var(--bp-accent)] px-4 text-sm font-black text-[var(--bp-accent-text)] shadow-[0_10px_24px_rgba(253,239,75,0.16)] transition hover:brightness-95 active:scale-[0.98] sm:flex"
              type="button"
            >
              {t('dashboard.newReminder')}
            </button>
            <LanguageToggle />
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={`Switch to ${mode === 'dark' ? 'light' : 'dark'} mode`}
              aria-pressed={mode === 'light'}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--bp-border)] bg-[var(--bp-surface)] text-base font-black text-[var(--bp-text)] transition hover:border-[var(--bp-accent)] sm:h-12 sm:w-12"
            >
              {mode === 'dark' ? '\u2600' : '\u263e'}
            </button>
            <div
              aria-label={t('actions.userProfile')}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--bp-border)] bg-[var(--bp-surface)] text-sm font-black text-[var(--bp-text)] sm:h-12 sm:w-12"
            >
              F
            </div>
          </div>
        </div>

        <div className="flex items-center rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-input)] px-3 transition-all focus-within:border-[var(--bp-accent)]">
          <svg
            aria-hidden="true"
            className="h-4 w-4 shrink-0 text-[var(--bp-subtle)]"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="M16.5 16.5L21 21" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
          </svg>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('dashboard.searchPlaceholder')}
            className="min-w-0 flex-1 bg-transparent px-3 py-3 text-sm text-[var(--bp-text)] outline-none placeholder:text-[var(--bp-placeholder)]"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="shrink-0 px-1 text-sm font-black text-[var(--bp-subtle)] hover:text-[var(--bp-text)]"
              type="button"
            >
              X
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto bg-[var(--bp-bg)] px-5 pb-3 sm:px-8">
        <div className="inline-flex min-w-max gap-1 rounded-full border border-[var(--bp-border)] bg-[var(--bp-surface)] p-1">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs transition-all duration-150 ${
                activeTab === tab
                  ? 'bg-[var(--bp-accent-soft)] font-semibold text-[var(--bp-accent)]'
                  : 'font-medium text-[var(--bp-subtle)] hover:bg-[var(--bp-input)] hover:text-[var(--bp-text)]'
              }`}
              type="button"
            >
              {t(`filters.${tab}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 pb-20 sm:px-8 sm:pb-8">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-16">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)]">
              <span className="text-xl font-black text-[var(--bp-accent)]">B</span>
            </div>
            <div className="text-center">
              <p className="mb-1 text-sm font-semibold text-[var(--bp-text)]">
                {search ? t('dashboard.noResults') : t('dashboard.noReminders')}
              </p>
              <p className="text-xs text-[var(--bp-subtle)]">
                {search ? t('dashboard.tryDifferentSearch') : t('dashboard.createFirstReminder')}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {filtered.map((reminder) => (
              <ReminderCard
                key={reminder.id}
                reminder={reminder}
                onPress={() => onSelect(reminder.id)}
                onToggle={() => onToggle(reminder.id)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="fixed bottom-6 end-6 sm:hidden">
        <button
          onClick={onCreate}
          aria-label={t('actions.newReminder')}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--bp-accent)] text-2xl font-black leading-none text-[var(--bp-accent-text)] shadow-[0_14px_34px_rgba(253,239,75,0.24)] transition hover:brightness-95 active:scale-95"
          type="button"
        >
          +
        </button>
      </div>
    </div>
  )
}
