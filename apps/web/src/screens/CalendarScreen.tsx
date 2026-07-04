import { useMemo, useState } from 'react'
import {
  AppLayout,
  CalendarIcon,
  EmptyState,
  PageHeader,
  RemindersIcon,
  SectionCard,
  TasksIcon,
  TopActionBar,
  type SidebarNavHandlers,
} from '../components/layout'
import { useLanguage } from '../i18n/LanguageContext'
import { useTheme } from '../theme/ThemeContext'
import type { ApiTask } from '../lib/tasksApi'
import type { Reminder } from '../features/reminders'

type CalendarScreenProps = SidebarNavHandlers & {
  tasks?: ApiTask[]
  reminders?: Reminder[]
  onSignOut?: () => void
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function isoToDateKey(iso?: string) {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return toDateKey(date)
}

export default function CalendarScreen({ tasks = [], reminders = [], onSignOut, ...nav }: CalendarScreenProps) {
  const { t, toggleLanguage, isRTL } = useLanguage()
  const { mode, toggleTheme } = useTheme()

  const today = useMemo(() => new Date(), [])
  const [viewDate, setViewDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [selectedDateKey, setSelectedDateKey] = useState(() => toDateKey(today))

  const tasksByDate = useMemo(() => {
    const map = new Map<string, ApiTask[]>()
    for (const task of tasks) {
      const key = isoToDateKey(task.dueDate)
      if (!key) continue
      map.set(key, [...(map.get(key) ?? []), task])
    }
    return map
  }, [tasks])

  const remindersByDate = useMemo(() => {
    const map = new Map<string, Reminder[]>()
    for (const reminder of reminders) {
      const key = isoToDateKey(reminder.remindAt)
      if (!key) continue
      map.set(key, [...(map.get(key) ?? []), reminder])
    }
    return map
  }, [reminders])

  const monthLabel = viewDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  const gridDays = useMemo(() => {
    const year = viewDate.getFullYear()
    const month = viewDate.getMonth()
    const firstOfMonth = new Date(year, month, 1)
    const startOffset = firstOfMonth.getDay()
    const gridStart = new Date(year, month, 1 - startOffset)

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index)
      return {
        date,
        key: toDateKey(date),
        inCurrentMonth: date.getMonth() === month,
        isToday: toDateKey(date) === toDateKey(today),
      }
    })
  }, [viewDate, today])

  const selectedTasks = tasksByDate.get(selectedDateKey) ?? []
  const selectedReminders = remindersByDate.get(selectedDateKey) ?? []

  function goToMonth(offset: number) {
    setViewDate((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1))
  }

  return (
    <AppLayout active="calendar" {...nav} panelTitle="Keep going!" panelCaption="You're doing great today." panelPercent={64}>
      <PageHeader
        title="Calendar"
        subtitle="See your schedule at a glance"
        toolbar={
          <TopActionBar
            searchValue=""
            onSearchChange={() => {}}
            themeMode={mode}
            onToggleTheme={toggleTheme}
            languageLabel={t('common.languageToggle')}
            onToggleLanguage={toggleLanguage}
            onProfileClick={onSignOut}
          />
        }
      />

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <SectionCard>
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => goToMonth(-1)}
              className="rounded-lg px-2 py-1 text-xs font-semibold text-[var(--bp-text)] hover:bg-[var(--bp-border)]"
            >
              {isRTL ? '→' : '←'} Prev
            </button>
            <h2 className="text-sm font-bold">{monthLabel}</h2>
            <button
              type="button"
              onClick={() => goToMonth(1)}
              className="rounded-lg px-2 py-1 text-xs font-semibold text-[var(--bp-text)] hover:bg-[var(--bp-border)]"
            >
              Next {isRTL ? '←' : '→'}
            </button>
          </div>

          <div className="mb-2 grid grid-cols-7 gap-1 text-center text-xs font-semibold text-slate-400">
            {WEEKDAY_LABELS.map((label) => (
              <div key={label}>{label}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {gridDays.map(({ date, key, inCurrentMonth, isToday }) => {
              const dayTasks = tasksByDate.get(key) ?? []
              const dayReminders = remindersByDate.get(key) ?? []
              const hasItems = dayTasks.length > 0 || dayReminders.length > 0
              const isSelected = key === selectedDateKey

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedDateKey(key)}
                  className={`flex aspect-square flex-col items-center justify-start gap-1 rounded-lg border p-1 text-xs transition ${
                    isSelected
                      ? 'border-[var(--bp-accent)] bg-[var(--bp-accent)]/15'
                      : 'border-transparent hover:border-[var(--bp-border)]'
                  } ${inCurrentMonth ? 'text-[var(--bp-text)]' : 'text-slate-500'}`}
                >
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full ${isToday ? 'bg-[var(--bp-accent)] font-bold text-[var(--bp-accent-text)]' : ''}`}>
                    {date.getDate()}
                  </span>
                  {hasItems && <span className="h-1.5 w-1.5 rounded-full bg-[var(--bp-accent)]" />}
                </button>
              )
            })}
          </div>
        </SectionCard>

        <SectionCard>
          <h2 className="mb-3 text-sm font-bold">
            {new Date(selectedDateKey).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          </h2>

          {selectedTasks.length === 0 && selectedReminders.length === 0 ? (
            <EmptyState icon={<CalendarIcon className="h-5 w-5" />} title="Nothing scheduled" description="No tasks or reminders are due on this day." />
          ) : (
            <div className="space-y-3">
              {selectedTasks.length > 0 && (
                <div>
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-400">
                    <TasksIcon className="h-4 w-4" /> Tasks
                  </h3>
                  <ul className="space-y-2">
                    {selectedTasks.map((task) => (
                      <li key={task.id} className="rounded-lg border border-[var(--bp-border)] px-3 py-2 text-sm">
                        <p className="font-semibold text-[var(--bp-text)]">{task.title}</p>
                        <p className="text-xs text-slate-400 capitalize">{task.status.replace('_', ' ')} - {task.priority}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {selectedReminders.length > 0 && (
                <div>
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-400">
                    <RemindersIcon className="h-4 w-4" /> Reminders
                  </h3>
                  <ul className="space-y-2">
                    {selectedReminders.map((reminder) => (
                      <li key={reminder.id} className="rounded-lg border border-[var(--bp-border)] px-3 py-2 text-sm">
                        <p className="font-semibold text-[var(--bp-text)]">{reminder.title}</p>
                        <p className="text-xs text-slate-400 capitalize">{reminder.status}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </SectionCard>
      </div>
    </AppLayout>
  )
}
