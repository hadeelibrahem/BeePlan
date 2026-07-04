import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
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
import {
  changeTaskStatus,
  createTask,
  deleteTask,
  getDashboardSummary,
  getTask,
  getTasks,
  isValidTaskId,
  updateTask,
  type ApiTask,
  type DashboardSummary,
  type TaskPayload,
} from './lib/tasksApi'
import AuthScreen from './screens/AuthScreen'
import AllTasksScreen from './screens/AllTasksScreen'
import AnalyticsScreen from './screens/AnalyticsScreen'
import CalendarScreen from './screens/CalendarScreen'
import CreateTaskScreen from './screens/CreateTaskScreen'
import EditTaskScreen from './screens/EditTaskScreen'
import FocusScreen from './screens/FocusScreen'
import ForgotPasswordScreen from './screens/ForgotPasswordScreen'
import NotesScreen from './screens/NotesScreen'
import ResetPasswordScreen from './screens/ResetPasswordScreen'
import TaskDetailsScreen from './screens/TaskDetailsScreen'
import TasksDashboardScreen from './screens/TasksDashboardScreen'
import { ThemeProvider } from './theme/ThemeContext'

type AuthScreenState = 'auth' | 'forgot' | 'reset'
type AppScreen =
  | 'dashboard'
  | 'tasks'
  | 'focus'
  | 'createTask'
  | 'taskDetails'
  | 'editTask'
  | 'list'
  | 'create'
  | 'details'
  | 'edit'
  | 'calendar'
  | 'notes'
  | 'analytics'

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
  const [tasks, setTasks] = useState<ApiTask[]>([])
  const [tasksLoading, setTasksLoading] = useState(false)
  const [tasksError, setTasksError] = useState('')
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryError, setSummaryError] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const { accessToken, loading, user, signOut } = useAuth()
  const queryClient = useQueryClient()
  const invalidateTaskFilters = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
    [queryClient],
  )

  useEffect(() => {
    const syncPath = () => setAuthScreen(getAuthScreenFromPath())
    window.addEventListener('popstate', syncPath)
    return () => window.removeEventListener('popstate', syncPath)
  }, [])

  useEffect(() => {
    if (!user || !accessToken) return
    fetchReminders(accessToken).then(setReminders)
  }, [user, accessToken])

  useEffect(() => {
    if (!user || !accessToken) return

    setTasksLoading(true)
    setTasksError('')
    getTasks(accessToken)
      .then(setTasks)
      .catch((error) => {
        setTasksError(error instanceof Error ? error.message : 'Unable to load tasks.')
      })
      .finally(() => setTasksLoading(false))
  }, [accessToken, user])

  const refreshSummary = useCallback(() => {
    if (!accessToken) return

    setSummaryLoading(true)
    setSummaryError('')
    getDashboardSummary(accessToken)
      .then(setSummary)
      .catch((error) => {
        setSummaryError(error instanceof Error ? error.message : 'Unable to load dashboard summary.')
      })
      .finally(() => setSummaryLoading(false))
  }, [accessToken])

  useEffect(() => {
    if (!user || !accessToken) return
    refreshSummary()
  }, [accessToken, user, refreshSummary])

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
    if (!accessToken) return
    const current = reminders.find((reminder) => reminder.id === id)
    if (!current) return

    // Optimistic update: flip the reminder's status locally right away and
    // roll back only if the request fails.
    const optimisticStatus = current.status === 'done' ? 'active' : 'done'
    setReminders((currentList) =>
      currentList.map((reminder) => (reminder.id === id ? { ...reminder, status: optimisticStatus } : reminder)),
    )

    try {
      const updated = await toggleReminderStatus(id, accessToken, current.status)
      if (!updated) return
      setReminders((currentList) => currentList.map((reminder) => (reminder.id === id ? updated : reminder)))
      refreshSummary()
    } catch {
      setReminders((currentList) => currentList.map((reminder) => (reminder.id === id ? current : reminder)))
    }
  }

  async function handleSignOut() {
    await signOut()
    setScreen('dashboard')
    setTasks([])
    setSelectedTaskId(null)
    navigateAuth('auth')
  }

  async function handleCreateTask(payload: TaskPayload) {
    if (!accessToken) return
    const createdTask = await createTask(accessToken, payload)
    setTasks((current) => [createdTask, ...current])
    setSelectedTaskId(createdTask.id)
    setScreen('taskDetails')
    refreshSummary()
    invalidateTaskFilters()
  }

  function showInvalidTaskIdError(action: string) {
    setTasksError(`Cannot ${action} because this task is missing a valid database id. Please refresh tasks and try again.`)
  }

  function openTaskDetails(taskId: string) {
    if (!isValidTaskId(taskId)) {
      showInvalidTaskIdError('open this task')
      setScreen('tasks')
      return
    }

    setTasksError('')
    setSelectedTaskId(taskId)
    setScreen('taskDetails')
  }

  async function openEditTask(taskId: string) {
    if (!isValidTaskId(taskId)) {
      showInvalidTaskIdError('edit this task')
      setScreen('tasks')
      return
    }

    setTasksError('')
    try {
      await refreshSelectedTask(taskId)
      setSelectedTaskId(taskId)
      setScreen('editTask')
    } catch (error) {
      setTasksError(error instanceof Error ? error.message : 'Unable to load this task for editing.')
      setScreen('tasks')
    }
  }

  async function handleUpdateTask(taskId: string, payload: TaskPayload) {
    if (!accessToken) return
    if (!isValidTaskId(taskId)) {
      showInvalidTaskIdError('save this task')
      return
    }

    const updatedTask = await updateTask(accessToken, taskId, payload)
    setTasks((current) => current.map((task) => (task.id === taskId ? updatedTask : task)))
    setSelectedTaskId(updatedTask.id)
    setScreen('taskDetails')
    refreshSummary()
    invalidateTaskFilters()
  }

  async function handleDeleteTask(taskId: string) {
    if (!accessToken) return
    if (!isValidTaskId(taskId)) {
      showInvalidTaskIdError('delete this task')
      setScreen('tasks')
      return
    }

    await deleteTask(accessToken, taskId)
    setTasks((current) => current.filter((task) => task.id !== taskId))
    setSelectedTaskId(null)
    setScreen('tasks')
    refreshSummary()
    invalidateTaskFilters()
  }

  function handleTaskUpdated(updatedTask: ApiTask) {
    setTasks((current) => {
      const previous = current.find((item) => item.id === updatedTask.id)
      // The dashboard summary only depends on status/priority/dueDate/reminderEnabled
      // across all tasks — skip refetching it for edits that don't touch those
      // (e.g. a subtask toggle that doesn't flip the parent task's status).
      const summaryRelevantChange =
        !previous ||
        previous.status !== updatedTask.status ||
        previous.priority !== updatedTask.priority ||
        previous.dueDate !== updatedTask.dueDate ||
        previous.reminderEnabled !== updatedTask.reminderEnabled

      if (summaryRelevantChange) refreshSummary()

      return current.map((item) => (item.id === updatedTask.id ? updatedTask : item))
    })
  }

  async function refreshSelectedTask(taskId: string) {
    if (!accessToken) return
    if (!isValidTaskId(taskId)) {
      showInvalidTaskIdError('load this task')
      setScreen('tasks')
      return
    }

    const refreshedTask = await getTask(accessToken, taskId)
    setTasks((current) => current.map((task) => (task.id === taskId ? refreshedTask : task)))
  }

  useEffect(() => {
    if (screen !== 'taskDetails' || !selectedTaskId || !accessToken) return

    refreshSelectedTask(selectedTaskId).catch((error) => {
      setTasksError(error instanceof Error ? error.message : 'Unable to refresh task details.')
    })
  }, [accessToken, screen, selectedTaskId])

  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null

  const sidebarNav = {
    onNavigateDashboard: () => setScreen('dashboard'),
    onNavigateTasks: () => setScreen('tasks'),
    onNavigateFocus: () => setScreen('focus'),
    onNavigateReminders: () => setScreen('list'),
    onNavigateCalendar: () => setScreen('calendar'),
    onNavigateNotes: () => setScreen('notes'),
    onNavigateAnalytics: () => setScreen('analytics'),
  }

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
    return (
      <TasksDashboardScreen
        reminders={reminders}
        summary={summary}
        summaryLoading={summaryLoading}
        summaryError={summaryError}
        onRetrySummary={refreshSummary}
        onViewReminders={() => setScreen('list')}
        onViewTasks={() => setScreen('tasks')}
        onNavigateFocus={sidebarNav.onNavigateFocus}
        onNavigateCalendar={sidebarNav.onNavigateCalendar}
        onNavigateNotes={sidebarNav.onNavigateNotes}
        onNavigateAnalytics={sidebarNav.onNavigateAnalytics}
        onSignOut={() => void handleSignOut()}
      />
    )
  }

  if (screen === 'tasks') {
    return (
      <AllTasksScreen
        onBackDashboard={() => setScreen('dashboard')}
        onCreateTask={() => setScreen('createTask')}
        onViewTaskDetails={openTaskDetails}
        accessToken={accessToken}
        tasks={tasks}
        loading={tasksLoading}
        error={tasksError}
        onNavigateFocus={sidebarNav.onNavigateFocus}
        onNavigateReminders={sidebarNav.onNavigateReminders}
        onNavigateCalendar={sidebarNav.onNavigateCalendar}
        onNavigateNotes={sidebarNav.onNavigateNotes}
        onNavigateAnalytics={sidebarNav.onNavigateAnalytics}
        onSignOut={() => void handleSignOut()}
      />
    )
  }

  if (screen === 'focus') {
    return (
      <FocusScreen
        onBackDashboard={() => setScreen('dashboard')}
        onViewTaskDetails={openTaskDetails}
        tasks={tasks}
        onNavigateTasks={sidebarNav.onNavigateTasks}
        onNavigateReminders={sidebarNav.onNavigateReminders}
        onNavigateCalendar={sidebarNav.onNavigateCalendar}
        onNavigateNotes={sidebarNav.onNavigateNotes}
        onNavigateAnalytics={sidebarNav.onNavigateAnalytics}
        onSignOut={() => void handleSignOut()}
      />
    )
  }

  if (screen === 'calendar') {
    return <CalendarScreen {...sidebarNav} tasks={tasks} reminders={reminders} onSignOut={() => void handleSignOut()} />
  }

  if (screen === 'notes') {
    return <NotesScreen {...sidebarNav} accessToken={accessToken ?? ''} onSignOut={() => void handleSignOut()} />
  }

  if (screen === 'analytics') {
    return <AnalyticsScreen {...sidebarNav} tasks={tasks} reminders={reminders} onSignOut={() => void handleSignOut()} />
  }

  if (screen === 'createTask') {
    return (
      <CreateTaskScreen
        tasks={tasks}
        onCancel={() => setScreen('tasks')}
        onSave={handleCreateTask}
        onSignOut={() => void handleSignOut()}
        onNavigateDashboard={sidebarNav.onNavigateDashboard}
        onNavigateFocus={sidebarNav.onNavigateFocus}
        onNavigateReminders={sidebarNav.onNavigateReminders}
        onNavigateCalendar={sidebarNav.onNavigateCalendar}
        onNavigateNotes={sidebarNav.onNavigateNotes}
        onNavigateAnalytics={sidebarNav.onNavigateAnalytics}
      />
    )
  }

  if (screen === 'taskDetails' && selectedTask) {
    return (
      <TaskDetailsScreen
        task={selectedTask}
        tasks={tasks}
        accessToken={accessToken ?? ''}
        onTaskUpdated={handleTaskUpdated}
        onRefresh={() => void refreshSelectedTask(selectedTask.id)}
        onBack={() => setScreen('tasks')}
        onEdit={() => void openEditTask(selectedTask.id)}
        onDelete={() => void handleDeleteTask(selectedTask.id)}
        onMarkDone={async () => {
          if (!accessToken) return
          if (!isValidTaskId(selectedTask.id)) {
            showInvalidTaskIdError('update this task')
            setScreen('tasks')
            return
          }

          const updatedTask = await changeTaskStatus(accessToken, selectedTask.id, { status: 'done' })
          setTasks((current) => current.map((task) => (task.id === selectedTask.id ? updatedTask : task)))
          setScreen('tasks')
          refreshSummary()
          invalidateTaskFilters()
        }}
        onSignOut={() => void handleSignOut()}
        onNavigateDashboard={sidebarNav.onNavigateDashboard}
        onNavigateFocus={sidebarNav.onNavigateFocus}
        onNavigateReminders={sidebarNav.onNavigateReminders}
        onNavigateCalendar={sidebarNav.onNavigateCalendar}
        onNavigateNotes={sidebarNav.onNavigateNotes}
        onNavigateAnalytics={sidebarNav.onNavigateAnalytics}
      />
    )
  }

  if (screen === 'editTask' && selectedTask) {
    return (
      <EditTaskScreen
        task={selectedTask}
        tasks={tasks}
        accessToken={accessToken ?? ''}
        onBack={() => setScreen('taskDetails')}
        onCancel={() => setScreen('taskDetails')}
        onDelete={() => void handleDeleteTask(selectedTask.id)}
        onSave={(payload) => void handleUpdateTask(selectedTask.id, payload)}
        onTaskUpdated={handleTaskUpdated}
        onSignOut={() => void handleSignOut()}
        onNavigateDashboard={sidebarNav.onNavigateDashboard}
        onNavigateFocus={sidebarNav.onNavigateFocus}
        onNavigateReminders={sidebarNav.onNavigateReminders}
        onNavigateCalendar={sidebarNav.onNavigateCalendar}
        onNavigateNotes={sidebarNav.onNavigateNotes}
        onNavigateAnalytics={sidebarNav.onNavigateAnalytics}
      />
    )
  }

  if (screen === 'create') {
    return renderShell(
      <CreateReminderScreen
        accessToken={accessToken ?? ''}
        onCancel={() => setScreen('list')}
        onCreated={(reminder) => {
          setReminders((current) => [reminder, ...current])
          setSelectedId(reminder.id)
          setScreen('details')
          refreshSummary()
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
        accessToken={accessToken ?? ''}
        onCancel={() => setScreen('details')}
        onSaved={(reminder) => {
          setReminders((current) => current.map((item) => (item.id === reminder.id ? reminder : item)))
          setSelectedId(reminder.id)
          setScreen('details')
          refreshSummary()
        }}
      />,
    )
  }

  return (
    <RemindersListScreen
      reminders={reminders}
      onCreate={() => setScreen('create')}
      onSelect={(id) => {
        setSelectedId(id)
        setScreen('details')
      }}
      onToggle={handleToggle}
      onBack={() => setScreen('dashboard')}
      onSignOut={() => void handleSignOut()}
      onNavigateTasks={sidebarNav.onNavigateTasks}
      onNavigateFocus={sidebarNav.onNavigateFocus}
      onNavigateCalendar={sidebarNav.onNavigateCalendar}
      onNavigateNotes={sidebarNav.onNavigateNotes}
      onNavigateAnalytics={sidebarNav.onNavigateAnalytics}
    />
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




