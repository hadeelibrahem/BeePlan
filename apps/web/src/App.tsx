import { useEffect, useState } from 'react'
import './App.css'
import {
  CreateReminderScreen,
  EditReminderScreen,
  ReminderDetailsScreen,
  RemindersListScreen,
  fetchReminders,
  toggleReminderStatus,
  type Reminder,
} from './features/reminders'
import { LanguageProvider } from './i18n/LanguageContext'
import { ThemeProvider } from './theme/ThemeContext'

type Screen = 'list' | 'create' | 'details' | 'edit'

export default function App() {
  return (
    <LanguageProvider>
      <ThemeProvider>
        <ThemedApp />
      </ThemeProvider>
    </LanguageProvider>
  )
}

function ThemedApp() {
  const [screen, setScreen] = useState<Screen>('list')
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    fetchReminders().then(setReminders)
  }, [])

  const selectedReminder = reminders.find((reminder) => reminder.id === selectedId) ?? null

  async function handleToggle(id: string) {
    const updated = await toggleReminderStatus(id)
    if (!updated) return
    setReminders((current) => current.map((reminder) => (reminder.id === id ? updated : reminder)))
  }

  if (screen === 'create') {
    return renderShell(
      <CreateReminderScreen
        onCancel={() => setScreen('list')}
        onCreated={(reminder) => {
          setReminders((current) => [reminder, ...current])
          setSelectedId(reminder.id)
          setScreen('details')
        }}
      />,
    )
  }

  if (screen === 'details' && selectedReminder) {
    return renderShell(
      <ReminderDetailsScreen
        reminder={selectedReminder}
        onBack={() => setScreen('list')}
        onEdit={() => setScreen('edit')}
      />,
    )
  }

  if (screen === 'edit' && selectedReminder) {
    return renderShell(
      <EditReminderScreen
        reminder={selectedReminder}
        onCancel={() => setScreen('details')}
        onSaved={(reminder) => {
          setReminders((current) => current.map((item) => (item.id === reminder.id ? reminder : item)))
          setSelectedId(reminder.id)
          setScreen('details')
        }}
      />,
    )
  }

  return renderShell(
    <RemindersListScreen
      reminders={reminders}
      onCreate={() => setScreen('create')}
      onSelect={(id) => {
        setSelectedId(id)
        setScreen('details')
      }}
      onToggle={handleToggle}
    />,
  )
}

function renderShell(content: React.ReactNode) {
  return (
    <div className="min-h-screen bg-[var(--bp-bg)] text-[var(--bp-text)] transition-colors duration-200">
      <div className="mx-auto w-full max-w-7xl animate-[beeplanRise_420ms_ease-out] px-5 py-6 sm:px-8 lg:px-10">
        {content}
      </div>
    </div>
  )
}
