import { useCallback, useEffect, useState, type ReactNode, type SetStateAction } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router-dom'
import './App.css'
import {
  CreateReminderScreen,
  EditReminderScreen,
  ReminderDetailsScreen,
  RemindersListScreen,
  fetchReminders,
  toggleReminderStatus,
  type Reminder,
  type ReminderType,
} from './features/reminders'
import { SocialScreen } from './features/social'
import { NotificationsScreen } from './features/collaboration'
import { notificationTarget } from './features/collaboration/notificationRoutes'
import { useAuth } from './hooks/useAuth'
import { LanguageProvider } from './i18n/LanguageContext'
import {
  changeTaskStatus,
  createTask,
  deleteTask,
  dismissRecurrenceSuggestion,
  getTodayDashboard,
  getRecurrenceSuggestions,
  getTask,
  getTasks,
  isValidTaskId,
  recurrenceToApi,
  saveRecurrence,
  updateTask,
  type ApiTask,
  type TodayDashboard,
  type RecurrenceSuggestion,
  type TaskPayload,
} from './lib/tasksApi'
import AuthScreen from './screens/AuthScreen'
import AllTasksScreen from './screens/AllTasksScreen'
import AnalyticsScreen from './screens/AnalyticsScreen'
import AiPlannerScreen from './screens/AiPlannerScreen'
import AiTaskBuilderScreen from './screens/AiTaskBuilderScreen'
import CalendarScreen from './screens/CalendarScreen'
import CreateTaskScreen from './screens/CreateTaskScreen'
import EditTaskScreen from './screens/EditTaskScreen'
import FocusScreen from './screens/FocusScreen'
import FocusSessionScreen from './screens/FocusSessionScreen'
import ForgotPasswordScreen from './screens/ForgotPasswordScreen'
import NotesScreen from './screens/NotesScreen'
import ResetPasswordScreen from './screens/ResetPasswordScreen'
import SettingsScreen from './screens/SettingsScreen'
import TaskCollaborationScreen from './screens/TaskCollaborationScreen'
import TaskDetailsScreen from './screens/TaskDetailsScreen'
import TasksDashboardScreen from './screens/TasksDashboardScreen'
import { ThemeProvider } from './theme/ThemeContext'
import {
  TaskRecurrenceModal,
  type RecurrenceSettings,
} from './components/TaskRecurrenceModal'
import { RouteFallback } from './components/RouteFallback'
import { useToast } from './components/feedback/ToastProvider'
import { hasPersistedFocusSession, useFocusSession } from './lib/useFocusSession'
import { queryKeys } from './lib/queryKeys'
import { pathForScreen, resolveAppRoute, type AppScreen } from './lib/appRoutes'

type AuthScreenState = 'auth' | 'forgot' | 'reset'
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
  const location = useLocation()
  const navigate = useNavigate()
  const route = resolveAppRoute(location.pathname)
  const [authScreen, setAuthScreen] = useState<AuthScreenState>(() => getAuthScreenFromPath())
  const screen = route.screen
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [remindersLoading, setRemindersLoading] = useState(false)
  // Preselected reminder type when opening the create form (e.g. Person from
  // the "Create Person Reminder" CTA). Cleared for a plain "New Reminder".
  const [createReminderType, setCreateReminderType] = useState<ReminderType | undefined>(undefined)
  // Calendar passes a selected local date into the existing manual-create flow.
  const [createTaskInitialDueDate, setCreateTaskInitialDueDate] = useState<string | undefined>(undefined)
  const [taskActionError, setTaskActionError] = useState('')
  const [taskDetailsNotice, setTaskDetailsNotice] = useState('')
  const [summary, setSummary] = useState<TodayDashboard | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryError, setSummaryError] = useState('')
  const [recurrenceSuggestions, setRecurrenceSuggestions] = useState<RecurrenceSuggestion[]>([])
  const [activeRecurrenceSuggestion, setActiveRecurrenceSuggestion] = useState<RecurrenceSuggestion | null>(null)
  const [plannerRefreshKey, setPlannerRefreshKey] = useState(0)
  const [selectedIdState, setSelectedId] = useState<string | null>(null)
  const [selectedTaskIdState, setSelectedTaskId] = useState<string | null>(null)
  const selectedId = route.reminderId ?? selectedIdState
  const selectedTaskId = route.taskId ?? selectedTaskIdState
  const { accessToken, loading, user, signOut } = useAuth()
  const { showToast } = useToast()
  const queryClient = useQueryClient()
  // The base task list is the single task source for the app shell. Filtered
  // screens use their own query keys, and mutations update/invalidate all task
  // keys so list rows, details, and summary-driven screens converge on one cache.
  const tasksQuery = useQuery({
    queryKey: queryKeys.tasks.list({}),
    queryFn: () => getTasks(accessToken ?? ''),
    enabled: Boolean(user && accessToken),
  })
  const tasks = tasksQuery.data ?? []
  const tasksLoading = tasksQuery.isLoading
  const tasksError = taskActionError || (tasksQuery.error instanceof Error ? tasksQuery.error.message : '')
  const setTasks = useCallback(
    (updater: SetStateAction<ApiTask[]>) => {
      queryClient.setQueryData<ApiTask[]>(queryKeys.tasks.list({}), (current = []) =>
        typeof updater === 'function' ? updater(current) : updater,
      )
    },
    [queryClient],
  )
  const invalidateTaskFilters = useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all }),
    [queryClient],
  )
  const refreshPlanner = useCallback(() => setPlannerRefreshKey((value) => value + 1), [])

  useEffect(() => setAuthScreen(getAuthScreenFromPath()), [location.pathname])

  useEffect(() => {
    // Restore the dedicated focus workspace only from the initial dashboard route.
    if (location.pathname === '/' && hasPersistedFocusSession()) navigate('/focus/session', { replace: true })
  }, [location.pathname, navigate])

  useEffect(() => {
    if (!user || !accessToken) return
    setRemindersLoading(true)
    fetchReminders(accessToken).then(setReminders).finally(() => setRemindersLoading(false))
  }, [user, accessToken])

  const refreshSummary = useCallback(() => {
    if (!accessToken) return

    setSummaryLoading(true)
    setSummaryError('')
    getTodayDashboard(accessToken)
      .then(setSummary)
      .catch((error) => {
        setSummaryError(error instanceof Error ? error.message : 'Unable to load dashboard summary.')
      })
      .finally(() => setSummaryLoading(false))
  }, [accessToken])

  const refreshRecurrenceSuggestions = useCallback(() => {
    if (!accessToken) return

    getRecurrenceSuggestions(accessToken)
      .then((response) => setRecurrenceSuggestions(response.suggestions))
      .catch(() => setRecurrenceSuggestions([]))
  }, [accessToken])

  useEffect(() => {
    if (!user || !accessToken) return
    refreshSummary()
  }, [accessToken, user, refreshSummary])

  useEffect(() => {
    if (!user || !accessToken || tasksLoading) return
    refreshRecurrenceSuggestions()
  }, [accessToken, user, tasksLoading, tasks.length, refreshRecurrenceSuggestions])

  function navigateAuth(nextScreen: AuthScreenState) {
    const path =
      nextScreen === 'reset'
        ? '/reset-password'
        : nextScreen === 'forgot'
          ? '/forgot-password'
          : '/sign-in'

    navigate(path)
    setAuthScreen(nextScreen)
  }

  const setScreen = useCallback(
    (nextScreen: Exclude<AppScreen, 'notFound'>) => {
      navigate(pathForScreen(nextScreen, { taskId: selectedTaskId, reminderId: selectedId }))
    },
    [navigate, selectedId, selectedTaskId],
  )

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
      refreshPlanner()
    } catch {
      setReminders((currentList) => currentList.map((reminder) => (reminder.id === id ? current : reminder)))
    }
  }

  async function handleSignOut() {
    await signOut()
    setScreen('dashboard')
    queryClient.removeQueries({ queryKey: queryKeys.tasks.all })
    setSelectedTaskId(null)
    navigateAuth('auth')
  }

  async function handleCreateTask(payload: TaskPayload) {
    if (!accessToken) return
    const createdTask = await createTask(accessToken, payload)
    setTasks((current) => [createdTask, ...current])
    queryClient.setQueryData<ApiTask[]>(queryKeys.tasks.list({}), (current = []) =>
      current.some((task) => task.id === createdTask.id) ? current : [createdTask, ...current],
    )
    refreshSummary()
    invalidateTaskFilters()
    refreshPlanner()
    showToast({ tone: 'success', message: 'Task created.' })
    return createdTask
  }

  function showInvalidTaskIdError(action: string) {
    setTaskActionError(`Cannot ${action} because this task is missing a valid database id. Please refresh tasks and try again.`)
  }

  function openTaskDetails(taskId: string) {
    if (!isValidTaskId(taskId)) {
      showInvalidTaskIdError('open this task')
      setScreen('tasks')
      return
    }

    setTaskActionError('')
    setSelectedTaskId(taskId)
    navigate(pathForScreen('taskDetails', { taskId }))
  }

  // Opens a task that may not yet be in the loaded list (e.g. a shared task the
  // user just accepted from Notifications). Fetches it and inserts it so the
  // details screen can render immediately.
  async function openTaskFromNotification(taskId: string, targetPath = pathForScreen('taskDetails', { taskId })) {
    if (!accessToken || !isValidTaskId(taskId)) {
      openTaskDetails(taskId)
      return
    }
    try {
      const task = await getTask(accessToken, taskId)
      setTasks((current) =>
        current.some((item) => item.id === taskId)
          ? current.map((item) => (item.id === taskId ? task : item))
          : [task, ...current],
      )
      setSelectedTaskId(taskId)
      navigate(targetPath)
    } catch {
      setTaskActionError('This task is no longer available.')
      setScreen('tasks')
    }
  }

  async function openEditTask(taskId: string) {
    if (!isValidTaskId(taskId)) {
      showInvalidTaskIdError('edit this task')
      setScreen('tasks')
      return
    }

    setTaskActionError('')
    try {
      const refreshedTask = await refreshSelectedTask(taskId)
      setSelectedTaskId(taskId)
      if (refreshedTask && !canEditTask(refreshedTask)) {
        setTaskDetailsNotice("You don't have permission to edit this task.")
        setScreen('taskDetails')
        return
      }
      navigate(pathForScreen('editTask', { taskId }))
    } catch (error) {
      setTaskActionError(error instanceof Error ? error.message : 'Unable to load this task for editing.')
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
    syncTaskQueryCaches(updatedTask)
    refreshSummary()
    invalidateTaskFilters()
    refreshPlanner()
    showToast({ tone: 'success', message: 'Task updated.' })
    return updatedTask
  }

  function handleTaskCreated(task: ApiTask) {
    setCreateTaskInitialDueDate(undefined)
    setSelectedTaskId(task.id)
    navigate(pathForScreen('taskDetails', { taskId: task.id }))
  }

  function openCreateTask(initialDueDate?: string) {
    setCreateTaskInitialDueDate(initialDueDate)
    setScreen('createTask')
  }

  function handleTaskSaved(task: ApiTask) {
    setSelectedTaskId(task.id)
    navigate(pathForScreen('taskDetails', { taskId: task.id }))
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
    queryClient.setQueriesData<ApiTask[]>({ queryKey: queryKeys.tasks.all }, (current) =>
      Array.isArray(current) ? current.filter((task) => task.id !== taskId) : current,
    )
    setSelectedTaskId(null)
    setScreen('tasks')
    refreshSummary()
    invalidateTaskFilters()
    refreshPlanner()
    showToast({ tone: 'success', message: 'Task deleted.' })
  }

  function handleTaskUpdated(updatedTask: ApiTask) {
    setTasks((current) => current.map((item) => (item.id === updatedTask.id ? updatedTask : item)))
    syncTaskQueryCaches(updatedTask)
    refreshSummary()
    invalidateTaskFilters()
    refreshPlanner()
  }

  function syncTaskQueryCaches(updatedTask: ApiTask) {
    queryClient.setQueryData(queryKeys.tasks.detail(updatedTask.id), updatedTask)
    queryClient.setQueriesData<ApiTask[]>({ queryKey: queryKeys.tasks.all }, (current) =>
      Array.isArray(current)
        ? current.map((task) => (task.id === updatedTask.id ? updatedTask : task))
        : current,
    )
  }

  async function handleDismissRecurrenceSuggestion(suggestion: RecurrenceSuggestion) {
    setRecurrenceSuggestions((current) => current.filter((item) => item.id !== suggestion.id))
    if (!accessToken) return

    try {
      await dismissRecurrenceSuggestion(accessToken, suggestion.id)
    } catch {
      refreshRecurrenceSuggestions()
    }
  }

  async function handleSaveSuggestionRecurrence(recurrence: RecurrenceSettings | null) {
    if (!accessToken || !activeRecurrenceSuggestion || !recurrence) {
      setActiveRecurrenceSuggestion(null)
      return
    }

    const payload = recurrenceToApi(recurrence)
    if (!payload) {
      setActiveRecurrenceSuggestion(null)
      return
    }

    const updatedTask = await saveRecurrence(
      accessToken,
      activeRecurrenceSuggestion.sourceTaskId,
      payload,
    )
    handleTaskUpdated(updatedTask)
    setRecurrenceSuggestions((current) =>
      current.filter((item) => item.id !== activeRecurrenceSuggestion.id),
    )
    await dismissRecurrenceSuggestion(accessToken, activeRecurrenceSuggestion.id).catch(() => undefined)
    setActiveRecurrenceSuggestion(null)
    refreshRecurrenceSuggestions()
  }

  async function refreshSelectedTask(taskId: string) {
    if (!accessToken) return
    if (!isValidTaskId(taskId)) {
      showInvalidTaskIdError('load this task')
      setScreen('tasks')
      return
    }

    const refreshedTask = await getTask(accessToken, taskId)
    setTasks((current) =>
      current.some((task) => task.id === taskId)
        ? current.map((task) => (task.id === taskId ? refreshedTask : task))
        : [refreshedTask, ...current],
    )
    return refreshedTask
  }

  function canEditTask(task: ApiTask) {
    return task.viewerRole === 'owner' || task.viewerRole === 'editor' || task.canEdit === true
  }

  const focus = useFocusSession({
    accessToken: accessToken ?? '',
    onSessionFinished: (taskId) => {
      if (taskId && accessToken && isValidTaskId(taskId)) {
        void refreshSelectedTask(taskId)
      }
      refreshSummary()
      invalidateTaskFilters()
      refreshPlanner()
    },
  })

  useEffect(() => {
    if (screen !== 'taskDetails' || !selectedTaskId || !accessToken) return

    refreshSelectedTask(selectedTaskId).catch((error) => {
      setTaskActionError(error instanceof Error ? error.message : 'Unable to refresh task details.')
      setScreen('tasks')
    })
  }, [accessToken, screen, selectedTaskId, setScreen])

  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null
  const selectedTaskRecurrenceSuggestions = selectedTask
    ? recurrenceSuggestions.filter((suggestion) => suggestion.sourceTaskId === selectedTask.id)
    : []
  const suggestedRecurrence = activeRecurrenceSuggestion
    ? recurrenceSuggestionToSettings(activeRecurrenceSuggestion)
    : null

  const sidebarNav = {
    onNavigateDashboard: () => setScreen('dashboard'),
    onNavigateTasks: () => setScreen('tasks'),
    onNavigateFocus: () => setScreen('focus'),
    onNavigatePlanner: () => setScreen('planner'),
    onNavigateReminders: () => setScreen('list'),
    onNavigatePeople: () => setScreen('social'),
    onNavigateNotifications: () => setScreen('notifications'),
    onNavigateCalendar: () => setScreen('calendar'),
    onNavigateNotes: () => setScreen('notes'),
    onNavigateAnalytics: () => setScreen('analytics'),
    onNavigateSettings: () => setScreen('settings'),
  }

  function renderWithRecurrenceSuggestionModal(content: ReactNode) {
    return (
      <>
        {content}
        <TaskRecurrenceModal
          open={Boolean(activeRecurrenceSuggestion)}
          mode={activeRecurrenceSuggestion ? 'edit' : 'create'}
          recurrence={suggestedRecurrence}
          accessToken={accessToken ?? ''}
          onClose={() => setActiveRecurrenceSuggestion(null)}
          onSave={(recurrence) => void handleSaveSuggestionRecurrence(recurrence)}
        />
      </>
    )
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

  if (screen === 'notFound') {
    return <RouteFallback title="Page not found" message="The link you opened does not match a BeePlan page." onBack={() => setScreen('dashboard')} />
  }

  if (screen === 'dashboard') {
    return renderWithRecurrenceSuggestionModal(
      <TasksDashboardScreen
        dashboard={summary}
        summaryLoading={summaryLoading}
        summaryError={summaryError}
        onStartFocus={async (recommendation) => {
          const started = await focus.start({ id: recommendation.taskId, title: recommendation.taskTitle, subtaskId: recommendation.subtaskId, subtaskTitle: recommendation.subtaskTitle }, 'pomodoro', recommendation.estimatedMinutes ?? 25)
          if (started) setScreen('focusSession')
        }}
        onContinueFocus={() => setScreen('focusSession')}
        onRetrySummary={refreshSummary}
        onViewReminders={() => setScreen('list')}
        onViewTasks={() => setScreen('tasks')}
        onCreateTask={() => openCreateTask()}
        onCreateTaskAi={() => setScreen('aiPlanTask')}
        onCreateReminder={() => {
          setCreateReminderType(undefined)
          setScreen('create')
        }}
        onNavigateFocus={sidebarNav.onNavigateFocus}
        onNavigatePlanner={sidebarNav.onNavigatePlanner}
        onNavigatePeople={sidebarNav.onNavigatePeople}
        onNavigateNotifications={sidebarNav.onNavigateNotifications}
        onNavigateCalendar={sidebarNav.onNavigateCalendar}
        onNavigateNotes={sidebarNav.onNavigateNotes}
        onNavigateAnalytics={sidebarNav.onNavigateAnalytics}
        onSignOut={() => void handleSignOut()}
      />,
    )
  }

  if (screen === 'tasks') {
    return renderWithRecurrenceSuggestionModal(
      <AllTasksScreen
        onBackDashboard={() => setScreen('dashboard')}
        onCreateTask={() => openCreateTask()}
        onCreateTaskAi={() => setScreen('aiPlanTask')}
        onViewTaskDetails={openTaskDetails}
        accessToken={accessToken}
        recurrenceSuggestions={recurrenceSuggestions}
        error={tasksError}
        onTaskUpdated={handleTaskUpdated}
        onMakeRecurringSuggestion={setActiveRecurrenceSuggestion}
        onDismissRecurrenceSuggestion={(suggestion) => void handleDismissRecurrenceSuggestion(suggestion)}
        onNavigateFocus={sidebarNav.onNavigateFocus}
        onNavigatePlanner={sidebarNav.onNavigatePlanner}
        onNavigateReminders={sidebarNav.onNavigateReminders}
        onNavigatePeople={sidebarNav.onNavigatePeople}
        onNavigateNotifications={sidebarNav.onNavigateNotifications}
        onNavigateCalendar={sidebarNav.onNavigateCalendar}
        onNavigateNotes={sidebarNav.onNavigateNotes}
        onNavigateAnalytics={sidebarNav.onNavigateAnalytics}
        onSignOut={() => void handleSignOut()}
      />,
    )
  }

  if (screen === 'focusSession') {
    // Rendered OUTSIDE AppLayout: no sidebar, header, or navigation — a
    // dedicated distraction-free execution surface.
    return (
      <FocusSessionScreen
        accessToken={accessToken ?? ''}
        focus={focus}
        tasks={tasks}
        onExit={() => setScreen('focus')}
      />
    )
  }

  if (screen === 'focus') {
    return (
      <FocusScreen
        onBackDashboard={() => setScreen('dashboard')}
        onViewTaskDetails={openTaskDetails}
        tasks={tasks}
        accessToken={accessToken ?? ''}
        focus={focus}
        onTaskUpdated={handleTaskUpdated}
        onOpenWorkspace={() => setScreen('focusSession')}
        onNavigateTasks={sidebarNav.onNavigateTasks}
        onNavigatePlanner={sidebarNav.onNavigatePlanner}
        onNavigateReminders={sidebarNav.onNavigateReminders}
        onNavigatePeople={sidebarNav.onNavigatePeople}
        onNavigateNotifications={sidebarNav.onNavigateNotifications}
        onNavigateCalendar={sidebarNav.onNavigateCalendar}
        onNavigateNotes={sidebarNav.onNavigateNotes}
        onNavigateAnalytics={sidebarNav.onNavigateAnalytics}
        onSignOut={() => void handleSignOut()}
      />
    )
  }

  if (screen === 'planner') {
    return (
      <AiPlannerScreen
        accessToken={accessToken ?? ''}
        refreshKey={plannerRefreshKey}
        completedTaskIds={new Set(tasks.filter((task) => task.status === 'done').map((task) => task.id))}
        onCompleteTask={async (taskId) => {
          if (!accessToken || !isValidTaskId(taskId)) return
          const updatedTask = await changeTaskStatus(accessToken, taskId, { status: 'done' })
          setTasks((current) => current.map((task) => (task.id === taskId ? updatedTask : task)))
          refreshSummary()
          invalidateTaskFilters()
          refreshPlanner()
        }}
        onSignOut={() => void handleSignOut()}
        {...sidebarNav}
      />
    )
  }

  if (screen === 'calendar') {
    return (
      <CalendarScreen
        {...sidebarNav}
        tasks={tasks}
        reminders={reminders}
        onViewTask={openTaskDetails}
        onViewReminder={(reminderId) => {
          setSelectedId(reminderId)
          navigate(pathForScreen('details', { reminderId }))
        }}
        onCreateTaskForDate={openCreateTask}
        onSignOut={() => void handleSignOut()}
      />
    )
  }

  if (screen === 'notes') {
    return <NotesScreen {...sidebarNav} accessToken={accessToken ?? ''} onSignOut={() => void handleSignOut()} />
  }

  if (screen === 'social') {
    return <SocialScreen {...sidebarNav} accessToken={accessToken ?? ''} onSignOut={() => void handleSignOut()} />
  }

  if (screen === 'notifications') {
    return (
      <NotificationsScreen
        {...sidebarNav}
        accessToken={accessToken ?? ''}
        onOpenNotification={(notification, target) => {
          if (notification.taskId && notificationTarget(notification)) {
            void openTaskFromNotification(notification.taskId, target)
          }
        }}
        onSignOut={() => void handleSignOut()}
      />
    )
  }

  if (screen === 'analytics') {
    return <AnalyticsScreen {...sidebarNav} accessToken={accessToken ?? ''} onSignOut={() => void handleSignOut()} />
  }

  if (screen === 'settings') {
    return <SettingsScreen {...sidebarNav} accessToken={accessToken ?? ''} onSignOut={() => void handleSignOut()} />
  }

  if (screen === 'aiPlanTask') {
    return (
      <AiTaskBuilderScreen
        accessToken={accessToken ?? ''}
        onCancel={() => setScreen('tasks')}
        onSaveTask={handleCreateTask}
        onReminderCreated={(reminder) => setReminders((current) => [reminder, ...current])}
        onSaved={handleTaskCreated}
        onSignOut={() => void handleSignOut()}
        {...sidebarNav}
      />
    )
  }

  if (screen === 'createTask') {
    return (
      <CreateTaskScreen
        tasks={tasks}
        accessToken={accessToken ?? ''}
        initialDueDate={createTaskInitialDueDate}
        onCancel={() => {
          setCreateTaskInitialDueDate(undefined)
          setScreen('tasks')
        }}
        onSave={handleCreateTask}
        onCreated={handleTaskCreated}
        onSignOut={() => void handleSignOut()}
        onNavigateDashboard={sidebarNav.onNavigateDashboard}
        onNavigateFocus={sidebarNav.onNavigateFocus}
        onNavigatePlanner={sidebarNav.onNavigatePlanner}
        onNavigateReminders={sidebarNav.onNavigateReminders}
        onNavigatePeople={sidebarNav.onNavigatePeople}
        onNavigateNotifications={sidebarNav.onNavigateNotifications}
        onNavigateCalendar={sidebarNav.onNavigateCalendar}
        onNavigateNotes={sidebarNav.onNavigateNotes}
        onNavigateAnalytics={sidebarNav.onNavigateAnalytics}
      />
    )
  }

  if (screen === 'taskDetails' && selectedTask) {
    return renderWithRecurrenceSuggestionModal(
      <TaskDetailsScreen
        task={selectedTask}
        tasks={tasks}
        accessToken={accessToken ?? ''}
        currentUserId={user.id}
        recurrenceSuggestions={selectedTaskRecurrenceSuggestions}
        notice={taskDetailsNotice}
        onNoticeShown={() => setTaskDetailsNotice('')}
        onTaskUpdated={handleTaskUpdated}
        onRefresh={() => void refreshSelectedTask(selectedTask.id)}
        onBack={() => setScreen('tasks')}
        onEdit={() => void openEditTask(selectedTask.id)}
        onOpenAiCollaboration={() => setScreen('aiCollaboration')}
        onDelete={() => void handleDeleteTask(selectedTask.id)}
        onMakeRecurringSuggestion={setActiveRecurrenceSuggestion}
        onDismissRecurrenceSuggestion={(suggestion) => void handleDismissRecurrenceSuggestion(suggestion)}
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
          refreshPlanner()
        }}
        onSignOut={() => void handleSignOut()}
        onNavigateDashboard={sidebarNav.onNavigateDashboard}
        onNavigateFocus={sidebarNav.onNavigateFocus}
        onNavigatePlanner={sidebarNav.onNavigatePlanner}
        onNavigateReminders={sidebarNav.onNavigateReminders}
        onNavigatePeople={sidebarNav.onNavigatePeople}
        onNavigateNotifications={sidebarNav.onNavigateNotifications}
        onNavigateCalendar={sidebarNav.onNavigateCalendar}
        onNavigateNotes={sidebarNav.onNavigateNotes}
        onNavigateAnalytics={sidebarNav.onNavigateAnalytics}
      />,
    )
  }

  if (screen === 'aiCollaboration' && selectedTask) {
    return (
      <TaskCollaborationScreen
        task={selectedTask}
        accessToken={accessToken ?? ''}
        currentUserId={user.id}
        onBack={() => setScreen('taskDetails')}
        onSignOut={() => void handleSignOut()}
        onNavigateDashboard={sidebarNav.onNavigateDashboard}
        onNavigateFocus={sidebarNav.onNavigateFocus}
        onNavigatePlanner={sidebarNav.onNavigatePlanner}
        onNavigateReminders={sidebarNav.onNavigateReminders}
        onNavigatePeople={sidebarNav.onNavigatePeople}
        onNavigateNotifications={sidebarNav.onNavigateNotifications}
        onNavigateCalendar={sidebarNav.onNavigateCalendar}
        onNavigateNotes={sidebarNav.onNavigateNotes}
        onNavigateAnalytics={sidebarNav.onNavigateAnalytics}
      />
    )
  }

  if ((screen === 'taskDetails' || screen === 'editTask' || screen === 'aiCollaboration') && selectedTaskId && !selectedTask) {
    return <RouteFallback title="Opening task" message="Loading the task from this link..." actionLabel="Back to tasks" onBack={() => setScreen('tasks')} />
  }

  if (screen === 'editTask' && selectedTask) {
    return (
      <EditTaskScreen
        task={selectedTask}
        tasks={tasks}
        accessToken={accessToken ?? ''}
        currentUserId={user.id}
        onRefresh={() => void refreshSelectedTask(selectedTask.id)}
        onBack={() => setScreen('taskDetails')}
        onCancel={() => setScreen('taskDetails')}
        onOpenAiCollaboration={() => setScreen('aiCollaboration')}
        onDelete={() => void handleDeleteTask(selectedTask.id)}
        onSave={(payload) => void handleUpdateTask(selectedTask.id, payload)}
        onTaskUpdated={handleTaskUpdated}
        onSaved={handleTaskSaved}
        onPermissionDenied={() => {
          setTaskDetailsNotice("You don't have permission to edit this task.")
          setScreen('taskDetails')
        }}
        onSignOut={() => void handleSignOut()}
        onNavigateDashboard={sidebarNav.onNavigateDashboard}
        onNavigateFocus={sidebarNav.onNavigateFocus}
        onNavigatePlanner={sidebarNav.onNavigatePlanner}
        onNavigateReminders={sidebarNav.onNavigateReminders}
        onNavigatePeople={sidebarNav.onNavigatePeople}
        onNavigateNotifications={sidebarNav.onNavigateNotifications}
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
        initialType={createReminderType}
        onCancel={() => setScreen('list')}
        onNavigatePeople={sidebarNav.onNavigatePeople}
        onCreated={(reminder) => {
          setReminders((current) => [reminder, ...current])
          setSelectedId(reminder.id)
          navigate(pathForScreen('details', { reminderId: reminder.id }))
          refreshSummary()
          refreshPlanner()
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
          refreshPlanner()
        }}
      />,
    )
  }

  return (
    <RemindersListScreen
      reminders={reminders}
      loading={remindersLoading}
      onCreate={() => {
        setCreateReminderType(undefined)
        setScreen('create')
      }}
      onCreatePerson={() => {
        setCreateReminderType('person')
        setScreen('create')
      }}
      onSelect={(id) => {
        setSelectedId(id)
        navigate(pathForScreen('details', { reminderId: id }))
      }}
      onToggle={handleToggle}
      onBack={() => setScreen('dashboard')}
      onSignOut={() => void handleSignOut()}
      onNavigateTasks={sidebarNav.onNavigateTasks}
      onNavigateFocus={sidebarNav.onNavigateFocus}
      onNavigatePlanner={sidebarNav.onNavigatePlanner}
      onNavigatePeople={sidebarNav.onNavigatePeople}
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

function recurrenceSuggestionToSettings(suggestion: RecurrenceSuggestion): RecurrenceSettings {
  const endType =
    suggestion.endCondition === 'onDate'
      ? 'onDate'
      : suggestion.endCondition === 'afterOccurrences'
        ? 'after'
        : 'never'

  const base: RecurrenceSettings = {
    frequency: 'Never',
    weekdays: suggestion.daysOfWeek,
    monthlyMode: suggestion.repeat === 'monthly' && suggestion.daysOfWeek.length ? 'firstWeekday' : 'sameDay',
    customInterval: Math.max(suggestion.interval, 1),
    customUnit: suggestion.repeat === 'daily' ? 'days' : suggestion.repeat === 'monthly' ? 'months' : 'weeks',
    endType,
    endDate: suggestion.endDate ?? '',
    occurrences: suggestion.occurrences ?? 1,
  }

  if (suggestion.repeat === 'daily') {
    return {
      ...base,
      frequency: suggestion.interval === 1 ? 'Daily' : 'Custom',
      weekdays: [],
      customUnit: 'days',
    }
  }

  if (suggestion.repeat === 'weekly') {
    return {
      ...base,
      frequency: suggestion.interval === 1 ? 'Weekly' : 'Custom',
      customUnit: 'weeks',
    }
  }

  if (suggestion.repeat === 'monthly') {
    return {
      ...base,
      frequency: suggestion.interval === 1 ? 'Monthly' : 'Custom',
      customUnit: 'months',
    }
  }

  if (suggestion.repeat === 'yearly') {
    return {
      ...base,
      frequency: suggestion.interval === 1 ? 'Yearly' : 'Custom',
      weekdays: [],
      customUnit: 'months',
      customInterval: Math.max(suggestion.interval * 12, 1),
    }
  }

  return base
}




