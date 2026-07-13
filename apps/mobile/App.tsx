import './global.css';

import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  CreateReminderScreen,
  EditReminderScreen,
  ReminderDetailsScreen,
  RemindersListScreen,
  fetchReminders,
  toggleReminderStatus,
  type Reminder,
} from './src/features/reminders';
import { AddTaskSheet } from './src/components/AddTaskSheet';
import { PeopleScreen } from './src/features/social';
import { NotificationsScreen } from './src/features/collaboration';
import { getLocationSharing } from './src/features/social/api/social.api';
import { startProximityMonitor, stopProximityMonitor } from './src/services/proximityMonitor';
import { useAuth } from './src/hooks/useAuth';
import { LanguageProvider } from './src/i18n/LanguageContext';
import { AuthProvider } from './src/providers/AuthProvider';
import AuthScreen from './src/screens/AuthScreen';
import AiTaskBuilderScreen from './src/screens/AiTaskBuilderScreen';
import AllTasksScreen from './src/screens/AllTasksScreen';
import CreateTaskScreen from './src/screens/CreateTaskScreen';
import EditTaskScreen from './src/screens/EditTaskScreen';
import FocusScreen from './src/screens/FocusScreen';
import FocusSessionScreen from './src/screens/FocusSessionScreen';
import ForgotPasswordScreen from './src/screens/ForgotPasswordScreen';
import ResetPasswordScreen from './src/screens/ResetPasswordScreen';
import { useFocusSession } from './src/lib/useFocusSession';
import TaskDetailsScreen from './src/screens/TaskDetailsScreen';
import TasksDashboardScreen from './src/screens/TasksDashboardScreen';
import { ThemeProvider } from './src/theme/ThemeContext';
import { useTheme } from './src/theme/useTheme';
import {
  changeTaskStatus,
  createTask,
  deleteTask,
  getDashboardSummary,
  getTask,
  getTasks,
  updateTask,
  type ApiTask,
  type DashboardSummary,
  type TaskPayload,
} from './src/lib/tasksApi';
import { queryKeys } from './src/lib/queryKeys';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, gcTime: 5 * 60_000, refetchOnReconnect: true, retry: 1 },
    mutations: { retry: 0 },
  },
});

type AppScreen =
  | 'auth'
  | 'forgot'
  | 'reset'
  | 'dashboard'
  | 'tasks'
  | 'focus'
  | 'focusSession'
  | 'createTask'
  | 'aiPlanTask'
  | 'taskDetails'
  | 'editTask'
  | 'reminders'
  | 'create'
  | 'details'
  | 'edit'
  | 'social'
  | 'notifications';

export default function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <LanguageProvider>
            <ThemeProvider>
              <ThemedApp />
            </ThemeProvider>
          </LanguageProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

function ThemedApp() {
  const [screen, setScreen] = useState<AppScreen>('auth');
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState('');
  const [taskDetailsNotice, setTaskDetailsNotice] = useState('');
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<ApiTask | null>(null);
  const [addTaskSheetVisible, setAddTaskSheetVisible] = useState(false);
  const { accessToken, loading, user, signOut } = useAuth();
  const { theme } = useTheme();
  const queryClient = useQueryClient();
  const invalidateTaskFilters = useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all }),
    [queryClient],
  );

  useEffect(() => {
    const handleUrl = (url: string | null) => {
      if (!url || !url.includes('reset-password')) return;
      setScreen('reset');
    };

    Linking.getInitialURL().then(handleUrl);

    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleUrl(url);
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!user || !accessToken) return;

    console.log('[App] reminders screen mounted for user � calling GET /reminders');
    fetchReminders(accessToken)
      .then((fetched) => {
        console.log('[App] fetchReminders resolved with', fetched.length, 'reminder(s)');
        setReminders(fetched);
      })
      .catch((error: unknown) => {
        console.error('[App] fetchReminders failed:', error);
        const message = error instanceof Error ? error.message : 'Could not load reminders.';
        Alert.alert('Failed to load reminders', message);
      });
  }, [user, accessToken]);

  // Run the foreground proximity monitor when the user needs to post location
  // snapshots — i.e. they either (a) have an active person reminder (they are
  // the VIEWER, waiting to be alerted when near a friend) OR (b) have granted a
  // friend an active location-sharing permission (they are the OWNER, whose
  // location the friend's reminder needs). Case (b) is essential: without it
  // the target friend never posts a snapshot, so the viewer's nearby check can
  // never find them and no notification ever fires. Snapshots go only to
  // BeePlan's own endpoint — never to any AI service.
  useEffect(() => {
    if (!user || !accessToken) {
      stopProximityMonitor();
      return;
    }

    const hasActivePersonReminder = reminders.some(
      (reminder) => (reminder.type as string) === 'person' && reminder.status === 'active',
    );

    let cancelled = false;
    void (async () => {
      let sharingAsOwnerActive = false;
      try {
        const permissions = await getLocationSharing();
        // direction 'incoming' === this user is the owner being observed.
        sharingAsOwnerActive = permissions.some(
          (p) => p.direction === 'incoming' && p.status === 'active',
        );
      } catch (error) {
        console.log('[App] could not load location-sharing for monitor decision:', error);
      }
      if (cancelled) return;

      const shouldMonitor = hasActivePersonReminder || sharingAsOwnerActive;
      console.log(
        `[App] proximity monitor decision — personReminder=${hasActivePersonReminder} ownerSharing=${sharingAsOwnerActive} => ${
          shouldMonitor ? 'START' : 'STOP'
        }`,
      );
      if (shouldMonitor) {
        void startProximityMonitor();
      } else {
        stopProximityMonitor();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [reminders, user, accessToken]);

  useEffect(() => {
    if (!user || !accessToken) return;

    setTasksLoading(true);
    setTasksError('');
    getTasks(accessToken)
      .then((loadedTasks) => {
        setTasks(loadedTasks);
        queryClient.setQueryData(queryKeys.tasks.list({}), loadedTasks);
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Could not load tasks.';
        setTasksError(message);
      })
      .finally(() => setTasksLoading(false));
  }, [accessToken, user, queryClient]);

  // Ids of tasks shared *with* the user (accepted member) — drives the
  // "👥 Shared" badge in lists. Refreshed whenever the task list changes.
  const [sharedTaskIds, setSharedTaskIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!user || !accessToken) return;
    getTasks(accessToken, { shared: true })
      .then((shared) => setSharedTaskIds(new Set(shared.map((t) => t.id))))
      .catch(() => setSharedTaskIds(new Set()));
  }, [accessToken, user, tasks]);

  const loadDashboardSummary = useCallback(() => {
    if (!accessToken) return;

    setSummaryLoading(true);
    setSummaryError('');
    getDashboardSummary(accessToken)
      .then(setSummary)
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Could not load dashboard summary.';
        setSummaryError(message);
      })
      .finally(() => setSummaryLoading(false));
  }, [accessToken]);

  // Single shared focus-session instance so the Focus page and the full-screen
  // workspace stay in sync (AsyncStorage writes are async, so a per-screen
  // instance would race on the start → navigate hand-off).
  const focus = useFocusSession({
    accessToken: accessToken ?? '',
    onSessionFinished: (taskId, markedDone) => {
      if (taskId && markedDone) {
        setTasks((current) =>
          current.map((task) => (task.id === taskId ? { ...task, status: 'done', progress: 100 } : task)),
        );
      }
      invalidateTaskFilters();
      loadDashboardSummary();
    },
  });

  // Restore the full-screen workspace once if a session was live at launch.
  const focusRestoredRef = useRef(false);
  useEffect(() => {
    if (focusRestoredRef.current) return;
    if (user && focus.hydrated && focus.hasSession) {
      focusRestoredRef.current = true;
      setScreen('focusSession');
    }
  }, [user, focus.hydrated, focus.hasSession]);

  useEffect(() => {
    if (!user || !accessToken) return;
    loadDashboardSummary();
  }, [accessToken, user, loadDashboardSummary]);

  const selectedReminder = reminders.find((reminder) => reminder.id === selectedId) ?? null;

  async function handleToggle(id: string) {
    if (!accessToken) return;
    const current = reminders.find((reminder) => reminder.id === id);
    if (!current) return;

    const optimisticStatus = current.status === 'done' ? 'active' : 'done';
    setReminders((currentList) =>
      currentList.map((reminder) => (reminder.id === id ? { ...reminder, status: optimisticStatus } : reminder)),
    );

    try {
      const updated = await toggleReminderStatus(id, accessToken, current.status);
      if (!updated) return;
      setReminders((currentList) => currentList.map((reminder) => (reminder.id === id ? updated : reminder)));
      loadDashboardSummary();
    } catch (error) {
      setReminders((currentList) => currentList.map((reminder) => (reminder.id === id ? current : reminder)));
      console.error('[App] toggleReminderStatus failed:', error);
      const message = error instanceof Error ? error.message : 'Could not update reminder.';
      Alert.alert('Failed to update reminder', message);
    }
  }

  async function handleSignOut() {
    await signOut();
    setScreen('auth');
    setSelectedId(null);
    setSelectedTask(null);
    setReminders([]);
    setTasks([]);
    setSummary(null);
    setSummaryError('');
  }

  async function handleCreateTask(payload: TaskPayload) {
    if (!accessToken) return;
    try {
      const createdTask = await createTask(accessToken, payload);
      setTasks((current) => [createdTask, ...current]);
      queryClient.setQueryData<ApiTask[]>(queryKeys.tasks.list({}), (current = []) =>
        current.some((task) => task.id === createdTask.id) ? current : [createdTask, ...current],
      );
      invalidateTaskFilters();
      loadDashboardSummary();
      return createdTask;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not create task.';
      Alert.alert('Failed to create task', message);
    }
  }

  function handleTaskCreated(task: ApiTask) {
    setSelectedTask(task);
    setScreen('taskDetails');
  }

  // Re-fetch the open task (with collaboration context — viewerRole/canEdit
  // — so the details/edit screens reflect the caller's actual permissions)
  // after member/role changes, and whenever the details/edit screen opens.
  async function refreshSelectedTask() {
    if (!accessToken || !selectedTask?.id) return;
    try {
      const fresh = await getTask(accessToken, selectedTask.id);
      setTasks((current) => current.map((item) => (item.id === fresh.id ? fresh : item)));
      setSelectedTask(fresh);
      return fresh;
    } catch {
      /* non-fatal */
      return undefined;
    }
  }

  function canEditTask(task: ApiTask) {
    return task.viewerRole === 'owner' || task.viewerRole === 'editor' || task.canEdit === true;
  }

  useEffect(() => {
    if ((screen !== 'taskDetails' && screen !== 'editTask') || !selectedTask?.id || !accessToken) return;
    void refreshSelectedTask();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, selectedTask?.id, accessToken]);

  // Opens a task from a notification/invitation — the shared task may not be in
  // the current list yet, so refresh from the server first, then select it.
  async function openTaskFromNotification(taskId: string) {
    if (!accessToken) return;
    try {
      const target = await getTask(accessToken, taskId);
      setTasks((current) =>
        current.some((item) => item.id === taskId)
          ? current.map((item) => (item.id === taskId ? target : item))
          : [target, ...current],
      );
      setSelectedTask(target);
      setScreen('taskDetails');
    } catch {
      setScreen('tasks');
    }
  }

  async function handleUpdateTask(taskId: string, payload: TaskPayload) {
    if (!accessToken) return;
    const updatedTask = await updateTask(accessToken, taskId, payload);
    setTasks((current) => current.map((item) => (item.id === taskId ? updatedTask : item)));
    syncTaskQueryCaches(updatedTask);
    invalidateTaskFilters();
    loadDashboardSummary();
    return updatedTask;
  }

  function handleTaskSaved(task: ApiTask) {
    setSelectedTask(task);
    setScreen('taskDetails');
  }

  async function handleDeleteTask() {
    if (!accessToken || !selectedTask?.id) {
      setScreen('tasks');
      return;
    }

    try {
      await deleteTask(accessToken, selectedTask.id);
      setTasks((current) => current.filter((task) => task.id !== selectedTask.id));
      queryClient.setQueriesData<ApiTask[]>({ queryKey: queryKeys.tasks.all }, (current) =>
        Array.isArray(current) ? current.filter((task) => task.id !== selectedTask.id) : current,
      );
      setSelectedTask(null);
      setScreen('tasks');
      invalidateTaskFilters();
      loadDashboardSummary();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not delete task.';
      Alert.alert('Failed to delete task', message);
    }
  }

  async function handleMarkTaskDone() {
    if (!accessToken || !selectedTask?.id) {
      setScreen('tasks');
      return;
    }

    try {
      const updatedTask = await changeTaskStatus(accessToken, selectedTask.id, { status: 'done' });
      setTasks((current) => current.map((task) => (task.id === updatedTask.id ? updatedTask : task)));
      setSelectedTask(updatedTask);
      syncTaskQueryCaches(updatedTask);
      setScreen('tasks');
      invalidateTaskFilters();
      loadDashboardSummary();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not update task.';
      Alert.alert('Failed to update task', message);
    }
  }

  function handleTaskUpdated(updatedTask: ApiTask) {
    setTasks((current) => current.map((item) => (item.id === updatedTask.id ? updatedTask : item)));
    setSelectedTask(updatedTask);
    syncTaskQueryCaches(updatedTask);
    invalidateTaskFilters();
    loadDashboardSummary();
  }

  function syncTaskQueryCaches(updatedTask: ApiTask) {
    queryClient.setQueryData(queryKeys.tasks.detail(updatedTask.id), updatedTask);
    queryClient.setQueriesData<ApiTask[]>({ queryKey: queryKeys.tasks.all }, (current) =>
      Array.isArray(current)
        ? current.map((task) => (task.id === updatedTask.id ? updatedTask : task))
        : current,
    );
  }

  if (loading) {
    return (
      <View style={{ alignItems: 'center', backgroundColor: theme.colors.background, flex: 1, justifyContent: 'center' }}>
        <StatusBar backgroundColor={theme.colors.background} style={theme.statusBarStyle} translucent />
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  return (
    <View style={{ backgroundColor: theme.colors.background, flex: 1 }}>
      <StatusBar backgroundColor={theme.colors.background} style={theme.statusBarStyle} translucent />

      {screen === 'reset' ? (
        <ResetPasswordScreen
          initialEmail={resetEmail}
          initialCode={resetCode}
          onBack={() => setScreen('auth')}
        />
      ) : !user ? (
        <>
          {screen === 'auth' && (
            <AuthScreen
              onForgotPassword={() => setScreen('forgot')}
              onSuccess={() => setScreen('dashboard')}
            />
          )}
          {screen === 'forgot' && (
            <ForgotPasswordScreen
              onBack={() => setScreen('auth')}
              onReset={(email, devResetCode) => {
                setResetEmail(email);
                setResetCode(devResetCode ?? '');
                setScreen('reset');
              }}
            />
          )}
        </>
      ) : screen === 'dashboard' ? (
        <TasksDashboardScreen
          userName={user?.fullName}
          tasks={tasks}
          summary={summary}
          summaryLoading={summaryLoading}
          summaryError={summaryError}
          onRetrySummary={loadDashboardSummary}
          onSignOut={() => void handleSignOut()}
          onViewTasks={() => setScreen('tasks')}
          onViewFocus={() => setScreen('focus')}
          onViewReminders={() => setScreen('reminders')}
          onViewNotifications={() => setScreen('notifications')}
          sharedTaskIds={sharedTaskIds}
          onCreateTask={() => setAddTaskSheetVisible(true)}
          onViewTaskDetails={(task) => {
            setSelectedTask(task);
            setScreen('taskDetails');
          }}
        />
      ) : screen === 'tasks' ? (
        <AllTasksScreen
          onBackDashboard={() => setScreen('dashboard')}
          onViewFocus={() => setScreen('focus')}
          onViewReminders={() => setScreen('reminders')}
          onCreateTask={() => setAddTaskSheetVisible(true)}
          onViewTaskDetails={(task) => {
            setSelectedTask(tasks.find((item) => item.id === task.id) ?? null);
            setScreen('taskDetails');
          }}
          accessToken={accessToken}
          tasks={tasks}
          loading={tasksLoading}
          error={tasksError}
        />
      ) : screen === 'focusSession' ? (
        <FocusSessionScreen focus={focus} tasks={tasks} onExit={() => setScreen('focus')} />
      ) : screen === 'focus' ? (
        <FocusScreen
          onBackDashboard={() => setScreen('dashboard')}
          onViewReminders={() => setScreen('reminders')}
          onViewTaskDetails={(task) => {
            setSelectedTask(tasks.find((item) => item.id === task.id) ?? null);
            setScreen('taskDetails');
          }}
          tasks={tasks}
          accessToken={accessToken ?? ''}
          onTaskUpdated={handleTaskUpdated}
          focus={focus}
          onOpenWorkspace={() => setScreen('focusSession')}
        />
      ) : screen === 'createTask' ? (
        <CreateTaskScreen
          accessToken={accessToken ?? ''}
          onCancel={() => setScreen('tasks')}
          onSave={handleCreateTask}
          onCreated={handleTaskCreated}
        />
      ) : screen === 'aiPlanTask' ? (
        <AiTaskBuilderScreen
          accessToken={accessToken ?? ''}
          onCancel={() => setScreen('tasks')}
          onSaveTask={handleCreateTask}
          onReminderCreated={(reminder) => setReminders((current) => [reminder, ...current])}
          onSaved={handleTaskCreated}
        />
      ) : screen === 'taskDetails' ? (
        <TaskDetailsScreen
          task={selectedTask}
          tasks={tasks}
          accessToken={accessToken ?? ''}
          currentUserId={user?.id ?? ''}
          notice={taskDetailsNotice}
          onNoticeShown={() => setTaskDetailsNotice('')}
          onBack={() => setScreen('tasks')}
          onEdit={() => {
            if (selectedTask && !canEditTask(selectedTask)) {
              setTaskDetailsNotice("You don't have permission to edit this task.");
              return;
            }
            setScreen('editTask');
          }}
          onDelete={() => void handleDeleteTask()}
          onMarkDone={() => void handleMarkTaskDone()}
          onTaskUpdated={handleTaskUpdated}
          onRefresh={() => void refreshSelectedTask()}
        />
      ) : screen === 'editTask' ? (
        <EditTaskScreen
          task={selectedTask}
          accessToken={accessToken ?? ''}
          currentUserId={user?.id ?? ''}
          onRefresh={() => void refreshSelectedTask()}
          onBack={() => setScreen('taskDetails')}
          onCancel={() => setScreen('taskDetails')}
          onDelete={() => void handleDeleteTask()}
          onSave={(payload) => (selectedTask ? handleUpdateTask(selectedTask.id, payload) : undefined)}
          onSaved={handleTaskSaved}
          onPermissionDenied={() => {
            setTaskDetailsNotice("You don't have permission to edit this task.");
            setScreen('taskDetails');
          }}
        />
      ) : screen === 'create' ? (
        <CreateReminderScreen
          accessToken={accessToken ?? ''}
          onCancel={() => setScreen('reminders')}
          onNavigatePeople={() => setScreen('social')}
          onCreated={(reminder) => {
            setReminders((current) => [reminder, ...current]);
            setSelectedId(reminder.id);
            setScreen('details');
          }}
        />
      ) : screen === 'details' && selectedReminder ? (
        <ReminderDetailsScreen
          reminder={selectedReminder}
          onBack={() => setScreen('reminders')}
          onEdit={() => setScreen('edit')}
        />
      ) : screen === 'edit' && selectedReminder ? (
        <EditReminderScreen
          reminder={selectedReminder}
          accessToken={accessToken ?? ''}
          onCancel={() => setScreen('details')}
          onSaved={(reminder) => {
            setReminders((current) => current.map((item) => (item.id === reminder.id ? reminder : item)));
            setSelectedId(reminder.id);
            setScreen('details');
          }}
        />
      ) : screen === 'social' ? (
        <PeopleScreen
          onBack={() => setScreen('reminders')}
          onSignOut={() => void handleSignOut()}
        />
      ) : screen === 'notifications' ? (
        <NotificationsScreen
          onBack={() => setScreen('dashboard')}
          onSignOut={() => void handleSignOut()}
          onOpenTask={(taskId) => void openTaskFromNotification(taskId)}
        />
      ) : (
        <RemindersListScreen
          reminders={reminders}
          onCreate={() => setScreen('create')}
          onSelect={(id) => {
            setSelectedId(id);
            setScreen('details');
          }}
          onToggle={handleToggle}
          onSignOut={() => void handleSignOut()}
          onBack={() => setScreen('dashboard')}
          onViewPeople={() => setScreen('social')}
        />
      )}

      <AddTaskSheet
        visible={addTaskSheetVisible}
        onClose={() => setAddTaskSheetVisible(false)}
        onSelectManual={() => {
          setAddTaskSheetVisible(false);
          setScreen('createTask');
        }}
        onSelectAi={() => {
          setAddTaskSheetVisible(false);
          setScreen('aiPlanTask');
        }}
      />
    </View>
  );
}
