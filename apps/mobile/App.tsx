import './global.css';

import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { NavigationContainer, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Linking, View } from 'react-native';
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
import { getUnreadCount } from './src/features/collaboration/api/collaboration.api';
import { getLocationSharing } from './src/features/social/api/social.api';
import { startProximityMonitor, stopProximityMonitor } from './src/services/proximityMonitor';
import { useAuth } from './src/hooks/useAuth';
import { LanguageProvider } from './src/i18n/LanguageContext';
import { AuthProvider } from './src/providers/AuthProvider';
import AuthScreen from './src/screens/AuthScreen';
import AiTaskBuilderScreen from './src/screens/AiTaskBuilderScreen';
import AllTasksScreen from './src/screens/AllTasksScreen';
import FocusScreen from './src/screens/FocusScreen';
import FocusSessionScreen from './src/screens/FocusSessionScreen';
import ForgotPasswordScreen from './src/screens/ForgotPasswordScreen';
import ResetPasswordScreen from './src/screens/ResetPasswordScreen';
import { useFocusSession } from './src/lib/useFocusSession';
import { StrictFocusProvider } from './src/features/focus/StrictFocusContext';
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
import { ScreenHistory } from './src/lib/screenHistory';
import { linking } from './src/navigation/linking';
import { RootNavigator } from './src/navigation/RootNavigator';
import type { MainTabParamList, RootStackParamList } from './src/navigation/types';
import { TaskDetailsRoute } from './src/navigation/TaskDetailsRoute';
import { CreateTaskRoute } from './src/navigation/CreateTaskRoute';
import { EditTaskRoute } from './src/navigation/EditTaskRoute';
import { AiCollaborationRoute } from './src/navigation/AiCollaborationRoute';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { resolveHardwareBack, type AppScreen } from './src/navigation/backNavigation';
import { useHardwareBack } from './src/navigation/useHardwareBack';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, gcTime: 5 * 60_000, refetchOnReconnect: true, retry: 1 },
    mutations: { retry: 0 },
  },
});

export default function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <LanguageProvider>
            <ThemeProvider>
              <NavigationContainer linking={linking}>
                <ThemedApp />
              </NavigationContainer>
            </ThemeProvider>
          </LanguageProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

function ThemedApp() {
  const [screen, setScreenState] = useState<AppScreen>('auth');
  const screenHistory = useRef(new ScreenHistory<AppScreen>());
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
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<ApiTask | null>(null);
  const [addTaskSheetVisible, setAddTaskSheetVisible] = useState(false);
  const { accessToken, loading, user, signOut } = useAuth();
  const { theme } = useTheme();

  const refreshUnreadNotificationCount = useCallback(async () => {
    if (!user) {
      setUnreadNotificationCount(0);
      return;
    }
    try {
      const { count } = await getUnreadCount();
      setUnreadNotificationCount(count);
    } catch {
      // The badge is supplemental; navigation continues when this request fails.
    }
  }, [user]);

  useEffect(() => {
    void refreshUnreadNotificationCount();
  }, [refreshUnreadNotificationCount]);
  const queryClient = useQueryClient();
  const invalidateTaskFilters = useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all }),
    [queryClient],
  );

  // Keep the existing screen switch while giving Android a predictable logical back stack.
  const setScreen = useCallback((nextScreen: AppScreen) => {
    if (nextScreen === screen) return;
    screenHistory.current.push(screen, nextScreen);
    setScreenState(nextScreen);
  }, [screen]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      // A visible sheet always wins over navigation.
      if (addTaskSheetVisible) {
        setAddTaskSheetVisible(false);
        return true;
      }

      const goBack = () => {
        const previous = screenHistory.current.pop();
        setScreenState(previous ?? 'dashboard');
      };

      // Forms do not expose their internal dirty state yet, so hardware back
      // deliberately asks before leaving either creation or editing surface.
      if (screen === 'aiPlanTask' || screen === 'create' || screen === 'edit') {
        Alert.alert('Discard changes?', 'Your unsaved changes will be lost.', [
          { text: 'Keep editing', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: goBack },
        ]);
        return true;
      }

      if (screen === 'dashboard') return false;
      goBack();
      return true;
    });

    return () => subscription.remove();
  }, [addTaskSheetVisible, screen]);

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

  const refreshReminders = useCallback(async () => {
    if (!accessToken) return;
    const fetched = await fetchReminders(accessToken);
    setReminders(fetched);
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
  const deletingTaskRef = useRef<Promise<void> | null>(null);
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
    screenHistory.current.clear();
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

  function handleDeleteTask(): Promise<void> {
    if (deletingTaskRef.current) return deletingTaskRef.current;

    if (!accessToken || !selectedTask?.id) {
      setScreen('tasks');
      return Promise.resolve();
    }

    const deletion = (async () => {
      await deleteTask(accessToken, selectedTask.id);
      setTasks((current) => current.filter((task) => task.id !== selectedTask.id));
      queryClient.setQueriesData<ApiTask[]>({ queryKey: queryKeys.tasks.all }, (current) =>
        Array.isArray(current) ? current.filter((task) => task.id !== selectedTask.id) : current,
      );
      setSelectedTask(null);
      setScreen('tasks');
      invalidateTaskFilters();
      loadDashboardSummary();
    })();

    deletingTaskRef.current = deletion;
    void deletion.then(
      () => {
        if (deletingTaskRef.current === deletion) deletingTaskRef.current = null;
      },
      () => {
        if (deletingTaskRef.current === deletion) deletingTaskRef.current = null;
      },
    );
    return deletion;
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

  // Android hardware back: close an open sheet first, otherwise return to the
  // current screen's logical parent (mirroring the header back button). Only a
  // root screen (dashboard / auth) falls through to the OS to exit/background.
  // Form screens register their own higher-priority guard (useUnsavedBackGuard)
  // that intercepts this when they have unsaved edits.
  const handleHardwareBack = useCallback(() => {
    const decision = resolveHardwareBack({ screen, sheetOpen: addTaskSheetVisible });
    if (decision.type === 'close-sheet') {
      setAddTaskSheetVisible(false);
      return true;
    }
    if (decision.type === 'navigate') {
      setScreen(decision.to);
      return true;
    }
    return false;
  }, [screen, addTaskSheetVisible]);
  useHardwareBack(handleHardwareBack);

  if (loading) {
    return (
      <View style={{ alignItems: 'center', backgroundColor: theme.colors.background, flex: 1, justifyContent: 'center' }}>
        <StatusBar backgroundColor={theme.colors.background} style={theme.statusBarStyle} translucent />
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  // Stage 2A adapter: Dashboard is navigator-backed; destinations remain on
  // the legacy flow until their own tab/stack migrations land.
  const DashboardTab = () => {
    const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>();
    const rootNavigation = navigation.getParent<import('@react-navigation/native-stack').NativeStackNavigationProp<RootStackParamList>>();
    return (<>
    <TasksDashboardScreen
      userName={user?.fullName}
      tasks={tasks}
      summary={summary}
      summaryLoading={summaryLoading}
      summaryError={summaryError}
      onRetrySummary={loadDashboardSummary}
      onRefresh={loadDashboardSummary}
      onSignOut={() => void handleSignOut()}
      onViewTasks={() => navigation.navigate('Tasks')}
      onViewFocus={() => navigation.navigate('Focus')}
      onViewReminders={() => navigation.navigate('Reminders')}
      onViewNotifications={() => rootNavigation?.navigate('Notifications')}
      unreadCount={unreadNotificationCount}
      sharedTaskIds={sharedTaskIds}
      onCreateTask={() => setAddTaskSheetVisible(true)}
      onViewTaskDetails={(task) => rootNavigation?.navigate('TaskDetails', { taskId: task.id })}
    />
    <AddTaskSheet
      visible={addTaskSheetVisible}
      onClose={() => setAddTaskSheetVisible(false)}
      onSelectManual={() => { setAddTaskSheetVisible(false); rootNavigation?.navigate({ name: 'CreateTask', params: { source: 'dashboard' } }); }}
      onSelectAi={() => { setAddTaskSheetVisible(false); setScreen('aiPlanTask'); }}
    />
  </>);
  };

  // Stage 2B adapters: detail and creation flows stay legacy-controlled.
  const TasksTab = () => {
    const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>();
    const rootNavigation = navigation.getParent<import('@react-navigation/native-stack').NativeStackNavigationProp<RootStackParamList>>();
    return (<>
      <AllTasksScreen
        onBackDashboard={() => navigation.navigate('Dashboard')}
        onViewFocus={() => navigation.navigate('Focus')}
        onViewReminders={() => navigation.navigate('Reminders')}
        onCreateTask={() => setAddTaskSheetVisible(true)}
        onViewTaskDetails={(task) => rootNavigation?.navigate('TaskDetails', { taskId: task.id })}
        accessToken={accessToken}
        tasks={tasks}
        loading={tasksLoading}
        error={tasksError}
      />
      <AddTaskSheet
        visible={addTaskSheetVisible}
        onClose={() => setAddTaskSheetVisible(false)}
        onSelectManual={() => { setAddTaskSheetVisible(false); rootNavigation?.navigate({ name: 'CreateTask', params: { source: 'tasks' } }); }}
        onSelectAi={() => { setAddTaskSheetVisible(false); setScreen('aiPlanTask'); }}
      />
    </>);
  };

  // Stage 2C adapters: task details, reminders, and the dedicated workspace
  // remain legacy routes while the Focus tab owns the main focus surface.
  const FocusTab = () => {
    const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>();
    const rootNavigation = navigation.getParent<import('@react-navigation/native-stack').NativeStackNavigationProp<RootStackParamList>>();
    return (
      <FocusScreen
        onBackDashboard={() => navigation.navigate('Dashboard')}
        onViewReminders={() => navigation.navigate('Reminders')}
        onViewTaskDetails={(task) => rootNavigation?.navigate('TaskDetails', { taskId: task.id })}
        tasks={tasks}
        accessToken={accessToken ?? ''}
        onTaskUpdated={handleTaskUpdated}
        focus={focus}
        onOpenWorkspace={() => setScreen('focusSession')}
      />
    );
  };

  // Stage 2D adapters: reminder detail/create/edit, person reminders,
  // notifications, and People permissions remain legacy-controlled.
  const RemindersTab = () => {
    const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>();
    return (
      <RemindersListScreen
        reminders={reminders}
        onCreate={() => setScreen('create')}
        onSelect={(id) => {
          setSelectedId(id);
          setScreen('details');
        }}
        onToggle={handleToggle}
        onSignOut={() => void handleSignOut()}
        onBack={() => navigation.navigate('Dashboard')}
        onViewPeople={() => navigation.navigate('People')}
        onRefresh={refreshReminders}
      />
    );
  };

  // Stage 2E adapter: auth reset remains outside tabs; People owns all of its
  // friends, request, and location-permission subflows internally.
  const PeopleTab = () => {
    const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>();
    return <PeopleScreen onBack={() => navigation.navigate('Dashboard')} onSignOut={() => void handleSignOut()} />;
  };

  const TaskDetailsStackRoute = (props: NativeStackScreenProps<RootStackParamList, 'TaskDetails'>) => (
    <TaskDetailsRoute {...props} accessToken={accessToken ?? ''} tasks={tasks} currentUserId={user?.id ?? ''} notice={taskDetailsNotice}
      onNoticeShown={() => setTaskDetailsNotice('')} onBack={() => {
        if (props.navigation.canGoBack()) props.navigation.goBack()
        else props.navigation.reset({ index: 0, routes: [{ name: 'MainTabs', params: { screen: 'Tasks' } }] })
      }} onEdit={() => props.navigation.navigate('EditTask', { taskId: props.route.params.taskId })}
      onDelete={async () => {
        const taskId = props.route.params.taskId
        if (deletingTaskRef.current) return deletingTaskRef.current
        const deletion = (async () => {
          if (!accessToken) throw new Error('Please sign in again.')
          await deleteTask(accessToken, taskId)
          setTasks((current) => current.filter((task) => task.id !== taskId))
          queryClient.setQueriesData<ApiTask[]>({ queryKey: queryKeys.tasks.all }, (current) =>
            Array.isArray(current) ? current.filter((task) => task.id !== taskId) : current,
          )
          invalidateTaskFilters()
          loadDashboardSummary()
          props.navigation.reset({ index: 0, routes: [{ name: 'MainTabs', params: { screen: 'Tasks' } }] })
        })()
        deletingTaskRef.current = deletion
        try { await deletion } finally { if (deletingTaskRef.current === deletion) deletingTaskRef.current = null }
      }} onMarkDone={() => void handleMarkTaskDone()} onTaskUpdated={handleTaskUpdated}
      onRefresh={() => void refreshSelectedTask()} />
  );
  const CreateTaskStackRoute = (props: NativeStackScreenProps<RootStackParamList, 'CreateTask'>) => (
    <CreateTaskRoute {...props} accessToken={accessToken ?? ''} onSave={handleCreateTask} />
  );
  const EditTaskStackRoute = (props: NativeStackScreenProps<RootStackParamList, 'EditTask'>) => (
    <EditTaskRoute {...props} accessToken={accessToken ?? ''} tasks={tasks} currentUserId={user?.id ?? ''}
      onBack={() => props.navigation.goBack()} onCancel={() => props.navigation.goBack()} onRefresh={() => void refreshSelectedTask()}
      onDelete={handleDeleteTask} onSave={(payload) => handleUpdateTask(props.route.params.taskId, payload)} onSaved={handleTaskUpdated}
      onPermissionDenied={() => setTaskDetailsNotice("You don't have permission to edit this task.")} />
  );
  const AiCollaborationStackRoute = (props: NativeStackScreenProps<RootStackParamList, 'AiCollaboration'>) => (
    <AiCollaborationRoute {...props} accessToken={accessToken ?? ''} tasks={tasks} onBack={() => props.navigation.goBack()} />
  );
  const NotificationsStackRoute = (props: NativeStackScreenProps<RootStackParamList, 'Notifications'>) => (
    <NotificationsScreen
      onBack={() => props.navigation.goBack()}
      onSignOut={() => void handleSignOut()}
      onOpenTask={(taskId) => void openTaskFromNotification(taskId)}
      onUnreadCountChange={setUnreadNotificationCount}
    />
  );

  // StrictFocusProvider is the ROOT element of BOTH return paths. React keeps a
  // single instance across the tab-navigator ↔ focusSession transition, so
  // native app-blocking is never restarted merely because we switch screens.
  if (user && screen === 'dashboard') {
    return (
      <StrictFocusProvider active={focus.active} remainingMs={focus.remainingMs}>
        <RootNavigator tabScreens={{ Dashboard: DashboardTab, Tasks: TasksTab, Focus: FocusTab, Reminders: RemindersTab, People: PeopleTab }} taskDetailsRoute={TaskDetailsStackRoute} createTaskRoute={CreateTaskStackRoute} editTaskRoute={EditTaskStackRoute} aiCollaborationRoute={AiCollaborationStackRoute} notificationsRoute={NotificationsStackRoute} />
      </StrictFocusProvider>
    );
  }

  return (
    <StrictFocusProvider active={focus.active} remainingMs={focus.remainingMs}>
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
      ) : screen === 'focusSession' ? (
        <FocusSessionScreen focus={focus} tasks={tasks} onExit={() => setScreen('focus')} />
      ) : screen === 'aiPlanTask' ? (
        <AiTaskBuilderScreen
          accessToken={accessToken ?? ''}
          onCancel={() => setScreen('tasks')}
          onSaveTask={handleCreateTask}
          onReminderCreated={(reminder) => setReminders((current) => [reminder, ...current])}
          onSaved={handleTaskCreated}
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
      ) : screen === 'notifications' ? (
        <NotificationsScreen
          onBack={() => setScreen('dashboard')}
          onSignOut={() => void handleSignOut()}
          onOpenTask={(taskId) => void openTaskFromNotification(taskId)}
        />
      ) : null}

    </View>
    </StrictFocusProvider>
  );
}
