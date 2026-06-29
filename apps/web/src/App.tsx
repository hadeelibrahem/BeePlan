import { useEffect, useState, type ReactNode } from 'react'
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
import { useAuth } from './hooks/useAuth'
import { LanguageProvider } from './i18n/LanguageContext'
import AuthScreen from './screens/AuthScreen'
import AllTasksScreen from './screens/AllTasksScreen'
import CreateTaskScreen from './screens/CreateTaskScreen'
import EditTaskScreen from './screens/EditTaskScreen'
import ForgotPasswordScreen from './screens/ForgotPasswordScreen'
import ResetPasswordScreen from './screens/ResetPasswordScreen'
import TaskDetailsScreen from './screens/TaskDetailsScreen'
import TasksDashboardScreen from './screens/TasksDashboardScreen'
import { ThemeProvider } from './theme/ThemeContext'

type AuthScreenState = 'auth' | 'forgot' | 'reset'
type AppScreen =
  | 'dashboard'
  | 'tasks'
  | 'createTask'
  | 'taskDetails'
  | 'editTask'
  | 'list'
  | 'create'
  | 'details'
  | 'edit'

function getAuthScreenFromPath(): AuthScreenState {
  if (window.location.pathname === '/reset-password') return 'reset'
  if (window.location.pathname === '/forgot-password') return 'forgot'
  return 'auth'
}

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
  const [authScreen, setAuthScreen] = useState<AuthScreenState>(() => getAuthScreenFromPath())
  const [screen, setScreen] = useState<AppScreen>('dashboard')
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const { loading, user, signOut } = useAuth()

  useEffect(() => {
    const syncPath = () => setAuthScreen(getAuthScreenFromPath())
    window.addEventListener('popstate', syncPath)
    return () => window.removeEventListener('popstate', syncPath)
  }, [])

  useEffect(() => {
    if (!user) return
    fetchReminders().then(setReminders)
  }, [user])

  function navigateAuth(nextScreen: AuthScreenState) {
    const path =
      nextScreen === 'reset'
        ? '/reset-password'
        : nextScreen === 'forgot'
          ? '/forgot-password'
          : '/sign-in'

    window.history.pushState(null, '', path)
    setAuthScreen(nextScreen)
  }

  const selectedReminder = reminders.find((reminder) => reminder.id === selectedId) ?? null

  async function handleToggle(id: string) {
    const updated = await toggleReminderStatus(id)
    if (!updated) return
    setReminders((current) => current.map((reminder) => (reminder.id === id ? updated : reminder)))
  }

  async function handleSignOut() {
    await signOut()
    setScreen('dashboard')
    navigateAuth('auth')
  }

  const signOutButton = (
    <button
      type="button"
      onClick={() => void handleSignOut()}
      className="fixed end-6 top-6 z-10 rounded-full border border-[var(--bp-border)] bg-[var(--bp-surface)] px-4 py-2 text-xs font-bold text-[var(--bp-text)] shadow-lg transition hover:border-[var(--bp-accent)]"
    >
      Sign out
    </button>
  )

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bp-bg)] text-[var(--bp-text)]">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[rgba(253,239,75,0.3)] border-t-[var(--bp-accent)]" />
      </div>
    )
  }

  if (authScreen === 'reset') {
    return <ResetPasswordScreen onBack={() => navigateAuth('auth')} />
  }

  if (!user) {
    if (authScreen === 'forgot') {
      return <ForgotPasswordScreen onBack={() => navigateAuth('auth')} />
    }

    return <AuthScreen onForgot={() => navigateAuth('forgot')} />
  }

  if (screen === 'dashboard') {
    return renderShell(
      <TasksDashboardScreen
        reminders={reminders}
        onViewReminders={() => setScreen('list')}
        onViewTasks={() => setScreen('tasks')}
      />,
      signOutButton,
    )
  }

  if (screen === 'tasks') {
    return renderShell(
      <AllTasksScreen
        onBackDashboard={() => setScreen('dashboard')}
        onCreateTask={() => setScreen('createTask')}
        onViewTaskDetails={() => setScreen('taskDetails')}
      />,
      signOutButton,
    )
  }

  if (screen === 'createTask') {
    return renderShell(
      <CreateTaskScreen onCancel={() => setScreen('tasks')} onSave={() => setScreen('tasks')} />,
      signOutButton,
    )
  }

  if (screen === 'taskDetails') {
    return renderShell(
      <TaskDetailsScreen
        onBack={() => setScreen('tasks')}
        onEdit={() => setScreen('editTask')}
        onDelete={() => setScreen('tasks')}
      />,
      signOutButton,
    )
  }

  if (screen === 'editTask') {
    return renderShell(
      <EditTaskScreen
        onBack={() => setScreen('taskDetails')}
        onCancel={() => setScreen('taskDetails')}
        onDelete={() => setScreen('tasks')}
        onSave={() => setScreen('taskDetails')}
      />,
      signOutButton,
    )
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
    signOutButton,
  )
}

function renderShell(content: ReactNode, overlay?: ReactNode) {
  return (
    <div className="min-h-screen bg-[var(--bp-bg)] text-[var(--bp-text)] transition-colors duration-200">
      {overlay}
      <div className="mx-auto w-full max-w-7xl animate-[beeplanRise_420ms_ease-out] px-5 py-6 sm:px-8 lg:px-10">
        {content}
      </div>
    </div>
  )
}
