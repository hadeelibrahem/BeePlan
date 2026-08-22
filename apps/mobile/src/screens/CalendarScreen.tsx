import { useMemo, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { AppScreen, FilterTabs, PageHeader, SectionCard } from '../components/layout'
import type { Reminder } from '../features/reminders'
import type { ApiTask } from '../lib/tasksApi'
import { useTheme } from '../theme/useTheme'
import { createTaskParamsForCalendarDate } from './calendarCreateTask'
import { ExistingScheduleConflict } from '../components/ExistingScheduleConflict'
import { useLanguage } from '../i18n/LanguageContext'

type ViewMode = 'month' | 'week' | 'day'

const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

const keyForDateString = (value?: string) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : dayKey(date)
}

export default function CalendarScreen({ tasks, reminders, accessToken = '', onBack, onTask, onReminder, onCreateTask }: {
  tasks: ApiTask[]
  reminders: Reminder[]
  accessToken?: string
  onBack: () => void
  onTask: (id: string) => void
  onReminder: (id: string) => void
  onCreateTask: (params: ReturnType<typeof createTaskParamsForCalendarDate>) => void
}) {
  const { theme } = useTheme()
  const { colors } = theme
  const { t, language } = useLanguage()
  const tabs: { value: ViewMode; label: string }[] = [
    { value: 'month', label: t('calendar.month') },
    { value: 'week', label: t('calendar.week') },
    { value: 'day', label: t('calendar.day') },
  ]
  const [mode, setMode] = useState<ViewMode>('month')
  const [cursor, setCursor] = useState(new Date())
  const [selected, setSelected] = useState(dayKey(new Date()))

  const byDate = useMemo(() => {
    const map = new Map<string, { tasks: ApiTask[]; reminders: Reminder[] }>()
    for (const task of tasks) {
      const key = task.scheduledDate ?? keyForDateString(task.dueDate)
      if (!key) continue
      const current = map.get(key) ?? { tasks: [], reminders: [] }
      map.set(key, { ...current, tasks: [...current.tasks, task] })
    }
    for (const reminder of reminders) {
      const key = keyForDateString(reminder.remindAt)
      if (!key) continue
      const current = map.get(key) ?? { tasks: [], reminders: [] }
      map.set(key, { ...current, reminders: [...current.reminders, reminder] })
    }
    return map
  }, [reminders, tasks])

  const dates = useMemo(() => {
    if (mode === 'day') return [cursor]
    const start = new Date(cursor)
    if (mode === 'month') {
      start.setDate(1)
      start.setDate(1 - start.getDay())
      return Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index))
    }
    start.setDate(start.getDate() - start.getDay())
    return Array.from({ length: 7 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index))
  }, [cursor, mode])

  const selectedItems = byDate.get(selected) ?? { tasks: [], reminders: [] }
  const move = (amount: number) => setCursor((current) => new Date(
    current.getFullYear(),
    current.getMonth() + (mode === 'month' ? amount : 0),
    current.getDate() + (mode === 'month' ? 0 : amount * (mode === 'week' ? 7 : 1)),
  ))

  return (
    <AppScreen>
      <PageHeader title={t('calendar.title')} subtitle={t('calendar.subtitle')} onBack={onBack} />
      <ExistingScheduleConflict accessToken={accessToken} date={selected} />
      <FilterTabs tabs={tabs} active={mode} onChange={setMode} />
      <View className="mb-3 flex-row items-center justify-between">
        <Pressable onPress={() => move(-1)} accessibilityRole="button" accessibilityLabel={t('calendar.previousPeriod')}>
          <Text style={{ color: colors.accentInk }}>&lt; {t('calendar.previous')}</Text>
        </Pressable>
        <Text className="font-black" style={{ color: colors.text }}>
          {cursor.toLocaleDateString(language === 'ar' ? 'ar' : 'en-US', { month: 'long', year: 'numeric' })}
        </Text>
        <Pressable onPress={() => move(1)} accessibilityRole="button" accessibilityLabel={t('calendar.nextPeriod')}>
          <Text style={{ color: colors.accentInk }}>{t('calendar.next')} &gt;</Text>
        </Pressable>
      </View>
      <SectionCard>
        <View className="flex-row flex-wrap">
          {dates.map((date) => {
            const key = dayKey(date)
            const items = byDate.get(key)
            const active = key === selected
            return (
              <Pressable key={key} onPress={() => { setSelected(key); setCursor(date) }} accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={t('calendar.daySummary', { date: date.toLocaleDateString(language === 'ar' ? 'ar' : 'en-US'), tasks: items?.tasks.length ?? 0, reminders: items?.reminders.length ?? 0 })} className={mode === 'month' ? 'w-[14.28%] min-h-16 p-1' : 'w-full min-h-16 p-2'} style={{ backgroundColor: active ? colors.accentSoft : 'transparent', borderColor: colors.border, borderWidth: 0.5 }}>
                <Text style={{ color: colors.text }}>{date.getDate()}</Text>
                <View className="mt-1 flex-row gap-1">
                  {items?.tasks.length ? <View className="h-2 w-2 rounded-full" style={{ backgroundColor: colors.accent }} /> : null}
                  {items?.reminders.length ? <View className="h-2 w-2 rounded-full" style={{ backgroundColor: colors.warning }} /> : null}
                </View>
                {mode !== 'month' ? <Text className="mt-1 text-xs" style={{ color: colors.secondaryText }}>{t('calendar.counts', { tasks: items?.tasks.length ?? 0, reminders: items?.reminders.length ?? 0 })}</Text> : null}
              </Pressable>
            )
          })}
        </View>
      </SectionCard>
      <SectionCard className="mt-3">
        <View className="mb-2 flex-row items-center justify-between gap-3">
          <Text className="flex-1 font-black" style={{ color: colors.text }}>
          {new Date(`${selected}T00:00:00`).toLocaleDateString(language === 'ar' ? 'ar' : 'en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </Text>
          <Pressable
            onPress={() => onCreateTask(createTaskParamsForCalendarDate(selected))}
            accessibilityRole="button"
            accessibilityLabel={t('calendar.createTaskFor', { date: selected })}
            className="rounded-xl px-3 py-2 active:opacity-80"
            style={{ backgroundColor: colors.accent }}
          >
            <Text className="text-xs font-black" style={{ color: colors.accentText }}>+ {t('calendar.task')}</Text>
          </Pressable>
        </View>
        <ScrollView>
          {selectedItems.tasks.map((task) => <Pressable key={task.id} onPress={() => onTask(task.id)} accessibilityRole="button" accessibilityLabel={t('calendar.openTask', { title: task.title })} className="mb-2 rounded-lg p-2" style={{ backgroundColor: colors.background }}><Text style={{ color: colors.text }}>{t('calendar.taskValue', { title: task.title })}</Text></Pressable>)}
          {selectedItems.reminders.map((reminder) => <Pressable key={reminder.id} onPress={() => onReminder(reminder.id)} accessibilityRole="button" accessibilityLabel={t('calendar.openReminder', { title: reminder.title })} className="mb-2 rounded-lg p-2" style={{ backgroundColor: colors.background }}><Text style={{ color: colors.text }}>{t('calendar.reminderValue', { title: reminder.title })}</Text></Pressable>)}
          {!selectedItems.tasks.length && !selectedItems.reminders.length ? <Text style={{ color: colors.secondaryText }}>{t('calendar.nothingScheduled')}</Text> : null}
        </ScrollView>
      </SectionCard>
    </AppScreen>
  )
}
