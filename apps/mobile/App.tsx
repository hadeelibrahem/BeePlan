import './global.css';

import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { createNavigationContainerRef, NavigationContainer, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import {
  addNotificationResponseReceivedListener,
  getLastNotificationResponseAsync,
} from 'expo-notifications/build/NotificationsEmitter';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, BackHandler, Linking, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  CreateReminderScreen,
  EditReminderScreen,
  ReminderDetailsScreen,
  RemindersListScreen,
  fetchReminders,
  getReminderById,
  toggleReminderStatus,
  type Reminder,
} from './src/features/reminders';
import {
  startSmartLocationReminderMonitor,
  stopSmartLocationReminderMonitor,
} from './src/features/reminders/utils/smartLocationReminderMonitor';
import { AddTaskSheet } from './src/components/AddTaskSheet';
import { PeopleScreen } from './src/features/social';
import { createPersonReminderParams } from './src/features/reminders/personReminderNavigation';
import { NotificationsScreen } from './src/features/collaboration';
import { getUnreadCount } from './src/features/collaboration/api/collaboration.api';
import { getLocationSharing } from './src/features/social/api/social.api';
import { startProximityMonitor, stopProximityMonitor } from './src/services/proximityMonitor';
import { useAuth } from './src/hooks/useAuth';
import { LanguageProvider } from './src/i18n/LanguageContext';
import { AuthProvider } from './src/providers/AuthProvider';
import AuthScreen from './src/screens/AuthScreen';
import AiTaskBuilderScreen from './src/screens/AiTaskBuilderScreen';
import AiDailyPlannerScreen from './src/screens/AiDailyPlannerScreen';
import CalendarScreen from './src/screens/CalendarScreen';
import NotesScreen from './src/screens/NotesScreen';
import AnalyticsScreen from './src/screens/AnalyticsScreen';
import AllTasksScreen from './src/screens/AllTasksScreen';
import FocusScreen from './src/screens/FocusScreen';
import FocusSessionScreen from './src/screens/FocusSessionScreen';
import ForgotPasswordScreen from './src/screens/ForgotPasswordScreen';
import ResetPasswordScreen from './src/screens/ResetPasswordScreen';
import { useFocusSession } from './src/lib/useFocusSession';
import { syncWidget, pushSignedOutWidget } from './src/lib/widgetSync';
import { StrictFocusProvider } from './src/features/focus/StrictFocusContext';
import TasksDashboardScreen from './src/screens/TasksDashboardScreen';
import { ThemeProvider } from './src/theme/ThemeContext';
import { useTheme } from './src/theme/useTheme';
import {
  changeTaskStatus,
  createTask,
  deleteTask,
  getTodayDashboard,
  getTask,
  getTasks,
  updateTask,
  type ApiTask,
  type TodayDashboard,
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
import type { AppScreen } from './src/navigation/backNavigation';

const navigationRef = createNavigationContainerRef<RootStackParamList>();

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
              <NavigationContainer ref={navigationRef} linking={linking}>
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
  const [summary, setSummary] = useState<TodayDashboard | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState('');
  // Transient flag so the home-screen widget can acknowledge a just-finished
  // session ("Great job") and surface the next recommendation before settling
  // back to the normal recommended-work state.
  const [justCompleted, setJustCompleted] = useState(false);
  // Latest session presence, readable from the deep-link handler (whose effect
  // is created once) so a widget "Resume" tap can open the live session.
  const focusHasSessionRef = useRef(false);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
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
      if (!url) return;
      if (url.includes('reset-password')) {
        setScreen('reset');
        return;
      }
      // Widget deep links (beeplan://focus?action=…). React Navigation's linking
      // config already routes `focus` to the Focus tab — where the Start-Focus
      // flow surfaces the same recommendation with its validation intact, so we
      // deliberately do NOT auto-start a session here. For Resume we additionally
      // open the live full-screen session when one exists.
      if (url.includes('focus') && url.includes('action=resume') && focusHasSessionRef.current) {
        requestAnimationFrame(() => {
          if (navigationRef.isReady()) navigationRef.navigate('FocusSession');
        });
      }
    };

    Linking.getInitialURL().then(handleUrl);

    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleUrl(url);
    });

    return () => subscription.remove();
  }, []);

  // Open the relevant reminder when the user taps a reminder notification
  // (cold start via getLastNotificationResponseAsync, or while running via the
  // listener). Routes through React Navigation's ReminderDetails screen.
  useEffect(() => {
    const openReminderFromResponse = (response: unknown) => {
      const data = (
        response as {
          notification?: { request?: { content?: { data?: Record<string, unknown> } } };
        }
      )?.notification?.request?.content?.data;

      const reminderId = typeof data?.reminderId === 'string' ? data.reminderId : undefined;
      const url = typeof data?.url === 'string' ? data.url : undefined;
      const urlMatch = url?.match(/reminders\/([^/?#]+)/)?.[1];
      const targetId = reminderId ?? (urlMatch ? decodeURIComponent(urlMatch) : undefined);
      if (!targetId) return;

      const navigateToReminder = () => navigationRef.navigate('ReminderDetails', { reminderId: targetId });
      // On cold start the navigation container may not be ready the instant the
      // last response resolves; defer briefly if so.
      if (navigationRef.isReady()) navigateToReminder();
      else setTimeout(navigateToReminder, 500);
    };

    getLastNotificationResponseAsync().then((response) => {
      if (response) openReminderFromResponse(response);
    });

    const subscription = addNotificationResponseReceivedListener(openReminderFromResponse);
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
    getTodayDashboard(accessToken)
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

  useEffect(() => {
    if (!user || !accessToken || !reminders.length) return;

    let active = true;
    let subscription: { remove: () => void } | null = null;

    startSmartLocationReminderMonitor({
      reminders,
      accessToken,
      onReminderTriggered: (updatedReminder) => {
        setReminders((current) =>
          current.map((reminder) => (reminder.id === updatedReminder.id ? updatedReminder : reminder)),
        );
        loadDashboardSummary();
      },
    })
      .then((createdSubscription) => {
        if (!active) {
          stopSmartLocationReminderMonitor(createdSubscription);
          return;
        }
        subscription = createdSubscription;
      })
      .catch((error: unknown) => {
        console.error('[App] failed to start smart location reminder monitor:', error);
      });

    return () => {
      active = false;
      stopSmartLocationReminderMonitor(subscription);
    };
  }, [accessToken, loadDashboardSummary, reminders, user]);

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
      // Drive the widget's "completed → next" acknowledgement; the reload below
      // refreshes the recommendation the widget will offer as the next action.
      setJustCompleted(true);
      loadDashboardSummary();
    },
  });

  // Keep the deep-link handler's view of session presence current.
  useEffect(() => {
    focusHasSessionRef.current = focus.hasSession;
  }, [focus.hasSession]);

  // The completed-next acknowledgement is momentary: after a minute the widget
  // reverts to the normal recommendation. Starting a new session also clears it
  // (an active focus overrides everything in the mapper).
  useEffect(() => {
    if (!justCompleted) return;
    const timer = setTimeout(() => setJustCompleted(false), 60_000);
    return () => clearTimeout(timer);
  }, [justCompleted]);

  // Central widget sync: re-push whenever any input the snapshot depends on
  // changes — dashboard data, the live Focus session, auth, or a completion.
  // `focus.active` is a stable object (only changes on start/pause/extend/
  // finish), so this never fires on the per-second countdown tick.
  useEffect(() => {
    void syncWidget({
      dashboard: summary,
      active: focus.active,
      isAuthenticated: Boolean(user && accessToken),
      justCompleted,
    });
  }, [summary, focus.active, user, accessToken, justCompleted]);

  // "App returns to the foreground" trigger: refresh dashboard data (which then
  // re-pushes the widget through the effect above).
  useEffect(() => {
    if (!user || !accessToken) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') loadDashboardSummary();
    });
    return () => subscription.remove();
  }, [user, accessToken, loadDashboardSummary]);

  // Restore the full-screen workspace once if a session was live at launch.
  const focusRestoredRef = useRef(false);
  const deletingTaskRef = useRef<Promise<void> | null>(null);
  useEffect(() => {
    if (focusRestoredRef.current) return;
    if (user && focus.hydrated && focus.hasSession) {
      focusRestoredRef.current = true;
      navigationRef.navigate('FocusSession');
    }
  }, [user, focus.hydrated, focus.hasSession]);

  useEffect(() => {
    if (!user || !accessToken) return;
    loadDashboardSummary();
  }, [accessToken, user, loadDashboardSummary]);

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
    setSelectedTask(null);
    setReminders([]);
    setTasks([]);
    setSummary(null);
    setSummaryError('');
    setJustCompleted(false);
    // Wipe private task details from the widget and show the signed-out prompt.
    void pushSignedOutWidget();
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
    navigationRef.navigate('TaskDetails', { taskId: task.id });
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
      navigationRef.navigate('TaskDetails', { taskId });
    } catch {
      navigationRef.navigate('MainTabs', { screen: 'Tasks' });
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
    navigationRef.navigate('TaskDetails', { taskId: task.id });
  }

  function handleDeleteTask(): Promise<void> {
    if (deletingTaskRef.current) return deletingTaskRef.current;

    if (!accessToken || !selectedTask?.id) {
      navigationRef.navigate('MainTabs', { screen: 'Tasks' });
      return Promise.resolve();
    }

    const deletion = (async () => {
      await deleteTask(accessToken, selectedTask.id);
      setTasks((current) => current.filter((task) => task.id !== selectedTask.id));
      queryClient.setQueriesData<ApiTask[]>({ queryKey: queryKeys.tasks.all }, (current) =>
        Array.isArray(current) ? current.filter((task) => task.id !== selectedTask.id) : current,
      );
      setSelectedTask(null);
      navigationRef.navigate('MainTabs', { screen: 'Tasks' });
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
      navigationRef.navigate('MainTabs', { screen: 'Tasks' });
      return;
    }

    try {
      const updatedTask = await changeTaskStatus(accessToken, selectedTask.id, { status: 'done' });
      setTasks((current) => current.map((task) => (task.id === updatedTask.id ? updatedTask : task)));
      setSelectedTask(updatedTask);
      syncTaskQueryCaches(updatedTask);
      navigationRef.navigate('MainTabs', { screen: 'Tasks' });
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

  // Stage 2A adapter: Dashboard is navigator-backed; destinations remain on
  // the legacy flow until their own tab/stack migrations land.
  const DashboardTab = () => {
    const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>();
    const rootNavigation = navigation.getParent<import('@react-navigation/native-stack').NativeStackNavigationProp<RootStackParamList>>();
    return (<>
    <TasksDashboardScreen
      dashboard={summary}
      summaryLoading={summaryLoading}
      summaryError={summaryError}
      onRetrySummary={loadDashboardSummary}
      onRefresh={loadDashboardSummary}
      onSignOut={() => void handleSignOut()}
      onViewTasks={() => navigation.navigate('Tasks')}
      onViewFocus={() => navigation.navigate('Focus')}
      onViewReminders={() => navigation.navigate('Reminders')}
      onViewNotes={() => rootNavigation?.navigate('Notes')}
      onViewAnalytics={() => rootNavigation?.navigate('Analytics')}
      onViewCalendar={() => rootNavigation?.navigate('Calendar')}
      onViewAiDailyPlanner={() => rootNavigation?.navigate('AiDailyPlanner')}
      onViewNotifications={() => rootNavigation?.navigate('Notifications')}
      unreadCount={unreadNotificationCount}
      onStartFocus={async (item) => { const started = await focus.start({ id: item.taskId, title: item.taskTitle, subtaskId: item.subtaskId, subtaskTitle: item.subtaskTitle }, 'pomodoro', item.estimatedMinutes ?? 25); if (started) rootNavigation?.navigate('FocusSession'); }}
      onContinueFocus={() => rootNavigation?.navigate('FocusSession')}
    />
    <AddTaskSheet
      visible={addTaskSheetVisible}
      onClose={() => setAddTaskSheetVisible(false)}
      onSelectManual={() => { setAddTaskSheetVisible(false); rootNavigation?.navigate({ name: 'CreateTask', params: { source: 'dashboard' } }); }}
      onSelectAi={() => { setAddTaskSheetVisible(false); rootNavigation?.navigate('AiTaskBuilder', { source: 'dashboard' }); }}
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
        sharedTaskIds={sharedTaskIds}
        onTaskUpdated={handleTaskUpdated}
      />
      <AddTaskSheet
        visible={addTaskSheetVisible}
        onClose={() => setAddTaskSheetVisible(false)}
        onSelectManual={() => { setAddTaskSheetVisible(false); rootNavigation?.navigate({ name: 'CreateTask', params: { source: 'tasks' } }); }}
        onSelectAi={() => { setAddTaskSheetVisible(false); rootNavigation?.navigate('AiTaskBuilder', { source: 'tasks' }); }}
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
        onOpenWorkspace={() => rootNavigation?.navigate('FocusSession')}
      />
    );
  };

  // Stage 2D adapters: reminder detail/create/edit, person reminders,
  // notifications, and People permissions remain legacy-controlled.
  const RemindersTab = () => {
    const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>();
    const rootNavigation = navigation.getParent<import('@react-navigation/native-stack').NativeStackNavigationProp<RootStackParamList>>();
    return (
      <RemindersListScreen
        reminders={reminders}
        onCreate={() => rootNavigation?.navigate('CreateReminder', {})}
        onCreatePersonReminder={() => rootNavigation?.navigate('CreateReminder', createPersonReminderParams())}
        onSelect={(id) => rootNavigation?.navigate('ReminderDetails', { reminderId: id })}
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
    <CreateTaskRoute {...props} accessToken={accessToken ?? ''} tasks={tasks} onSave={handleCreateTask} />
  );
  const EditTaskStackRoute = (props: NativeStackScreenProps<RootStackParamList, 'EditTask'>) => (
    <EditTaskRoute {...props} accessToken={accessToken ?? ''} tasks={tasks} currentUserId={user?.id ?? ''}
      onBack={() => props.navigation.goBack()} onCancel={() => props.navigation.goBack()} onRefresh={() => void refreshSelectedTask()}
      onDelete={handleDeleteTask} onSave={(payload) => handleUpdateTask(props.route.params.taskId, payload)} onSaved={handleTaskUpdated}
      onSubtasksUpdated={handleTaskUpdated}
      onDependenciesUpdated={handleTaskUpdated}
      onPermissionDenied={() => setTaskDetailsNotice("You don't have permission to edit this task.")} />
  );
  const AiCollaborationStackRoute = (props: NativeStackScreenProps<RootStackParamList, 'AiCollaboration'>) => (
    <AiCollaborationRoute {...props} accessToken={accessToken ?? ''} tasks={tasks} onBack={() => props.navigation.goBack()} />
  );
  const NotificationsStackRoute = (props: NativeStackScreenProps<RootStackParamList, 'Notifications'>) => (
    <NotificationsScreen
      onBack={() => props.navigation.goBack()}
      onSignOut={() => void handleSignOut()}
      onOpenNotification={(notification) => {
        const data = notification.data ?? {};
        const reminderId = typeof data.reminderId === 'string' ? data.reminderId : undefined;
        if ((notification.type === 'reminder' || notification.type === 'reminder_updated') && reminderId) { props.navigation.navigate('ReminderDetails', { reminderId }); return; }
        if (notification.taskId && (data.destination === 'ai_collaboration' || data.notificationTarget === 'ai_collaboration' || data.tab === 'ai_collaboration')) { props.navigation.navigate('AiCollaboration', { taskId: notification.taskId }); return; }
        if (notification.taskId) void openTaskFromNotification(notification.taskId);
      }}
      onUnreadCountChange={setUnreadNotificationCount}
    />
  );
  const FocusSessionStackRoute = (props: NativeStackScreenProps<RootStackParamList, 'FocusSession'>) => (
    <FocusSessionScreen focus={focus} tasks={tasks} onExit={() => {
      if (props.navigation.canGoBack()) props.navigation.goBack()
      else props.navigation.reset({ index: 0, routes: [{ name: 'MainTabs', params: { screen: 'Focus' } }] })
    }} />
  );
  const AiTaskBuilderStackRoute = (props: NativeStackScreenProps<RootStackParamList, 'AiTaskBuilder'>) => (
    <AiTaskBuilderScreen accessToken={accessToken ?? ''} onCancel={() => {
      if (props.navigation.canGoBack()) props.navigation.goBack()
      else props.navigation.reset({ index: 0, routes: [{ name: 'MainTabs', params: { screen: 'Tasks' } }] })
    }} onSaveTask={handleCreateTask} onReminderCreated={(reminder) => setReminders((current) => [reminder, ...current])}
    onSaved={(task) => props.navigation.replace('TaskDetails', { taskId: task.id })} />
  );
  const AiDailyPlannerStackRoute = (props: NativeStackScreenProps<RootStackParamList, 'AiDailyPlanner'>) => (
    <AiDailyPlannerScreen accessToken={accessToken ?? ''} onBack={() => props.navigation.goBack()} />
  );
  const CalendarStackRoute = (props: NativeStackScreenProps<RootStackParamList, 'Calendar'>) => (
    <CalendarScreen tasks={tasks} reminders={reminders} onBack={() => props.navigation.goBack()} onTask={(taskId) => props.navigation.navigate('TaskDetails', { taskId })} onReminder={(reminderId) => props.navigation.navigate('ReminderDetails', { reminderId })} onCreateTask={(params) => props.navigation.navigate('CreateTask', params)} />
  );
  const NotesStackRoute = (props: NativeStackScreenProps<RootStackParamList, 'Notes'>) => (
    <NotesScreen accessToken={accessToken ?? ''} onBack={() => props.navigation.goBack()} />
  );
  const AnalyticsStackRoute = (props: NativeStackScreenProps<RootStackParamList, 'Analytics'>) => (
    <AnalyticsScreen accessToken={accessToken ?? ''} onBack={() => props.navigation.goBack()} />
  );
  const ReminderDetailsStackRoute = (props: NativeStackScreenProps<RootStackParamList, 'ReminderDetails'>) => {
    const [resolvedReminder, setResolvedReminder] = useState<Reminder | null>(null);
    const [loadingReminder, setLoadingReminder] = useState(true);
    const reminder = reminders.find((item) => item.id === props.route.params.reminderId) ?? resolvedReminder;
    useEffect(() => {
      if (reminder) { setLoadingReminder(false); return; }
      if (!accessToken) { setLoadingReminder(false); return; }
      void getReminderById(props.route.params.reminderId, accessToken).then(setResolvedReminder).finally(() => setLoadingReminder(false));
    }, [accessToken, props.route.params.reminderId, reminder]);
    if (!reminder) return <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center' }}>{loadingReminder ? <ActivityIndicator color={theme.colors.accent} /> : <Text style={{ color: theme.colors.error }}>Reminder not found.</Text>}</View>;
    return <ReminderDetailsScreen reminder={reminder} onBack={() => {
      if (props.navigation.canGoBack()) props.navigation.goBack()
      else props.navigation.reset({ index: 0, routes: [{ name: 'MainTabs', params: { screen: 'Reminders' } }] })
    }} onEdit={() => props.navigation.navigate('EditReminder', { reminderId: reminder.id })} />;
  };
  const CreateReminderStackRoute = (props: NativeStackScreenProps<RootStackParamList, 'CreateReminder'>) => (
    <CreateReminderScreen accessToken={accessToken ?? ''} initialType={props.route.params?.initialType} initialFriendId={props.route.params?.initialFriendId} onCancel={() => {
      if (props.navigation.canGoBack()) props.navigation.goBack()
      else props.navigation.reset({ index: 0, routes: [{ name: 'MainTabs', params: { screen: 'Reminders' } }] })
    }} onNavigatePeople={() => props.navigation.navigate('MainTabs', { screen: 'People' })} onCreated={(reminder) => {
      setReminders((current) => [reminder, ...current]);
      props.navigation.replace('ReminderDetails', { reminderId: reminder.id });
    }} />
  );
  const EditReminderStackRoute = (props: NativeStackScreenProps<RootStackParamList, 'EditReminder'>) => {
    const [resolvedReminder, setResolvedReminder] = useState<Reminder | null>(null);
    const [loadingReminder, setLoadingReminder] = useState(true);
    const reminder = reminders.find((item) => item.id === props.route.params.reminderId) ?? resolvedReminder;
    useEffect(() => {
      if (reminder) { setLoadingReminder(false); return; }
      if (!accessToken) { setLoadingReminder(false); return; }
      void getReminderById(props.route.params.reminderId, accessToken).then(setResolvedReminder).finally(() => setLoadingReminder(false));
    }, [accessToken, props.route.params.reminderId, reminder]);
    if (!reminder) return <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center' }}>{loadingReminder ? <ActivityIndicator color={theme.colors.accent} /> : <Text style={{ color: theme.colors.error }}>Reminder not found.</Text>}</View>;
    return <EditReminderScreen reminder={reminder} accessToken={accessToken ?? ''} onCancel={() => props.navigation.goBack()} onSaved={(updated) => {
      setReminders((current) => current.map((item) => item.id === updated.id ? updated : item));
      props.navigation.replace('ReminderDetails', { reminderId: updated.id });
    }} />;
  };

  // StrictFocusProvider is the ROOT element of BOTH return paths. React keeps a
  // single instance across the tab-navigator ↔ focusSession transition, so
  // native app-blocking is never restarted merely because we switch screens.
  if (user) {
    return (
      <StrictFocusProvider active={focus.active} remainingMs={focus.remainingMs}>
        <RootNavigator tabScreens={{ Dashboard: DashboardTab, Tasks: TasksTab, Focus: FocusTab, Reminders: RemindersTab, People: PeopleTab }} taskDetailsRoute={TaskDetailsStackRoute} createTaskRoute={CreateTaskStackRoute} editTaskRoute={EditTaskStackRoute} aiTaskBuilderRoute={AiTaskBuilderStackRoute} aiDailyPlannerRoute={AiDailyPlannerStackRoute} calendarRoute={CalendarStackRoute} notesRoute={NotesStackRoute} analyticsRoute={AnalyticsStackRoute} aiCollaborationRoute={AiCollaborationStackRoute} focusSessionRoute={FocusSessionStackRoute} reminderDetailsRoute={ReminderDetailsStackRoute} createReminderRoute={CreateReminderStackRoute} editReminderRoute={EditReminderStackRoute} notificationsRoute={NotificationsStackRoute} />
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
      ) : (
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
      )}

    </View>
    </StrictFocusProvider>
  );
}
