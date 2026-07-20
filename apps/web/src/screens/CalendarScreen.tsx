import { useMemo, useState, type KeyboardEvent } from 'react'
import {
  AppLayout,
  CalendarIcon,
  DirectionalChevron,
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
import { formatDate, parseLocalDate } from '../lib/dateTime'

type CalendarScreenProps = SidebarNavHandlers & {
  tasks?: ApiTask[]
  reminders?: Reminder[]
  onViewTask?: (taskId: string) => void
  onViewReminder?: (reminderId: string) => void
  onCreateTaskForDate?: (date: string) => void
  onSignOut?: () => void
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function isoToDateKey(iso?: string) {
  const date = parseLocalDate(iso)
  if (!date) return null
  return toDateKey(date)
}

export default function CalendarScreen({
  tasks = [],
  reminders = [],
  onViewTask,
  onViewReminder,
  onCreateTaskForDate,
  onSignOut,
  ...nav
}: CalendarScreenProps) {
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

  function goToToday() {
    setViewDate(new Date(today.getFullYear(), today.getMonth(), 1))
    setSelectedDateKey(toDateKey(today))
  }

  function selectDate(date: Date) {
    setSelectedDateKey(toDateKey(date))
    setViewDate(new Date(date.getFullYear(), date.getMonth(), 1))
  }

  function handleDayKeyDown(event: KeyboardEvent<HTMLButtonElement>, date: Date) {
    const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
    let next: Date | null = null
    if (event.key in offsets) next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + offsets[event.key])
    if (event.key === 'Home') next = new Date(date.getFullYear(), date.getMonth(), date.getDate() - date.getDay())
    if (event.key === 'End') next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + (6 - date.getDay()))
    if (!next) return
    event.preventDefault()
    selectDate(next)
  }

  return (
    <AppLayout active="calendar" {...nav}>
      <PageHeader
        title={t('taskUi.calendar.title')}
        subtitle={t('taskUi.calendar.subtitle')}
        toolbar={
          <TopActionBar
            themeMode={mode}
            onToggleTheme={toggleTheme}
            languageLabel={t('common.languageToggle')}
            onToggleLanguage={toggleLanguage}
            onOpenNotifications={nav.onNavigateNotifications}
            onSignOut={onSignOut}
          />
        }
      />

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <SectionCard>
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => goToMonth(-1)}
              className="rounded-lg px-2 py-1 text-xs font-semibold text-[var(--bp-text)] hover:bg-[var(--bp-border)]"
            >
              <span className="inline-flex items-center gap-1">
                <DirectionalChevron direction="back" isRTL={isRTL} className="h-4 w-4" />
                <span>Prev</span>
              </span>
            </button>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold">{monthLabel}</h2>
              <button
                type="button"
                onClick={goToToday}
                className="rounded-lg border border-[var(--bp-border)] px-2 py-1 text-xs font-semibold text-[var(--bp-text)] hover:bg-[var(--bp-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bp-accent)]"
              >
                Today
              </button>
            </div>
            <button
              type="button"
              onClick={() => goToMonth(1)}
              className="rounded-lg px-2 py-1 text-xs font-semibold text-[var(--bp-text)] hover:bg-[var(--bp-border)]"
            >
              <span className="inline-flex items-center gap-1">
                <span>Next</span>
                <DirectionalChevron direction="forward" isRTL={isRTL} className="h-4 w-4" />
              </span>
            </button>
          </div>

          <div className="mb-2 grid grid-cols-7 gap-1 text-center text-xs font-semibold text-slate-400">
            {WEEKDAY_LABELS.map((label) => (
              <div key={label}>{label}</div>
            ))}
          </div>

          <div role="grid" aria-label={`${monthLabel} calendar`} className="grid grid-cols-7 gap-1">
            {gridDays.map(({ date, key, inCurrentMonth, isToday }) => {
              const dayTasks = tasksByDate.get(key) ?? []
              const dayReminders = remindersByDate.get(key) ?? []
              const dayItems = [
                ...dayTasks.map((task) => ({ id: task.id, title: task.title, kind: 'task' as const })),
                ...dayReminders.map((reminder) => ({ id: reminder.id, title: reminder.title, kind: 'reminder' as const })),
              ]
              const isSelected = key === selectedDateKey

              return (
                <button
                  key={key}
                  type="button"
                  role="gridcell"
                  onClick={() => selectDate(date)}
                  onKeyDown={(event) => handleDayKeyDown(event, date)}
                  aria-selected={isSelected}
                  aria-current={isToday ? 'date' : undefined}
                  aria-label={`${date.toLocaleDateString(isRTL ? 'ar' : 'en', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}${isToday ? ', today' : ''}${dayItems.length ? `, ${dayItems.length} scheduled item${dayItems.length === 1 ? '' : 's'}` : ', no scheduled items'}`}
                  className={`flex aspect-square min-h-14 flex-col items-center justify-start gap-0.5 overflow-hidden rounded-lg border p-1 text-xs transition ${
                    isSelected
                      ? 'border-[var(--bp-accent)] bg-[var(--bp-accent)]/15'
                      : 'border-transparent hover:border-[var(--bp-border)]'
                  } ${inCurrentMonth ? 'text-[var(--bp-text)]' : 'text-slate-500'}`}
                >
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full ${isToday ? 'bg-[var(--bp-accent)] font-bold text-[var(--bp-accent-text)]' : ''}`}>
                    {date.getDate()}
                  </span>
                  <div className="hidden w-full space-y-0.5 md:block">
                    {dayItems.slice(0, 2).map((item) => (
                      <span
                        key={`${item.kind}-${item.id}`}
                        className="block w-full truncate rounded bg-[var(--bp-border)]/80 px-1 text-[9px] leading-3 text-[var(--bp-text)]"
                      >
                        {item.title}
                      </span>
                    ))}
                    {dayItems.length > 2 && <span className="block text-[10px] font-semibold text-[var(--bp-accent)]">+{dayItems.length - 2}</span>}
                  </div>
                  {dayItems.length > 0 && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--bp-accent)] md:hidden" />}
                </button>
              )
            })}
          </div>
        </SectionCard>

        <SectionCard>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold">
              {formatDate(selectedDateKey, isRTL ? 'ar' : 'en', { weekday: 'long', month: 'long', day: 'numeric' })}
            </h2>
            {onCreateTaskForDate && (
              <button
                type="button"
                onClick={() => onCreateTaskForDate(selectedDateKey)}
                className="shrink-0 rounded-lg bg-[var(--bp-accent)] px-2.5 py-1.5 text-xs font-bold text-[var(--bp-accent-text)] hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bp-accent)]"
              >
                Add task
              </button>
            )}
          </div>

          {selectedTasks.length === 0 && selectedReminders.length === 0 ? (
            <EmptyState icon={<CalendarIcon className="h-5 w-5" />} title={t('taskUi.calendar.emptyTitle')} description={t('taskUi.calendar.emptyDescription')} />
          ) : (
            <div className="space-y-3">
              {selectedTasks.length > 0 && (
                <div>
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-400">
                    <TasksIcon className="h-4 w-4" /> Tasks
                  </h3>
                  <ul className="space-y-2">
                    {selectedTasks.map((task) => (
                      <li key={task.id}>
                        <button
                          type="button"
                          onClick={() => onViewTask?.(task.id)}
                          aria-label={`Open task: ${task.title}`}
                          className="w-full rounded-lg border border-[var(--bp-border)] px-3 py-2 text-left text-sm transition hover:bg-[var(--bp-border)]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bp-accent)]"
                        >
                          <p className="font-semibold text-[var(--bp-text)]">{task.title}</p>
                          <p className="text-xs text-slate-400 capitalize">{task.status.replace('_', ' ')} - {task.priority}</p>
                        </button>
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
                      <li key={reminder.id}>
                        <button
                          type="button"
                          onClick={() => onViewReminder?.(reminder.id)}
                          aria-label={`Open reminder: ${reminder.title}`}
                          className="w-full rounded-lg border border-[var(--bp-border)] px-3 py-2 text-left text-sm transition hover:bg-[var(--bp-border)]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bp-accent)]"
                        >
                          <p className="font-semibold text-[var(--bp-text)]">{reminder.title}</p>
                          <p className="text-xs text-slate-400 capitalize">{reminder.status}</p>
                        </button>
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
