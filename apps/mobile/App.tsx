import './global.css';

import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { createNavigationContainerRef, NavigationContainer, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import {
  addNotificationReceivedListener,
  addNotificationResponseReceivedListener,
  getLastNotificationResponseAsync,
} from 'expo-notifications/build/NotificationsEmitter';
import setBadgeCountAsync from 'expo-notifications/build/setBadgeCountAsync';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, BackHandler, Linking, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApiRequestError } from './src/lib/apiClient';
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
import { notificationDestination } from './src/features/collaboration/notificationRouting';
import { getUnreadCount } from './src/features/collaboration/api/collaboration.api';
import { getLocationSharing } from './src/features/social/api/social.api';
import { startProximityMonitor, stopProximityMonitor } from './src/services/proximityMonitor';
import { acknowledgeWeatherTravelDelivery, syncWeatherTravelNotifications } from './src/lib/weatherTravelNotificationSync';
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
import FocusRoomsScreen from './src/screens/FocusRoomsScreen';
import FocusSessionScreen from './src/screens/FocusSessionScreen';
import ForgotPasswordScreen from './src/screens/ForgotPasswordScreen';
import ResetPasswordScreen from './src/screens/ResetPasswordScreen';
import { useFocusSession } from './src/lib/useFocusSession';
import { listRooms } from './src/lib/focusRoomsApi';
import { syncWidget, pushSignedOutWidget } from './src/lib/widgetSync';
import { StrictFocusProvider } from './src/features/focus/StrictFocusContext';
import TasksDashboardScreen from './src/screens/TasksDashboardScreen';
import RandomStartScreen from './src/screens/RandomStartScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import FeedbackScreen from './src/screens/FeedbackScreen';
import FeedbackDetailScreen from './src/screens/FeedbackDetailScreen';
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
import { TimeCapsulesScreen } from './src/features/timeCapsules/TimeCapsulesScreen';

const navigationRef = createNavigationContainerRef<RootStackParamList>();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnReconnect: true,
      retry: (failureCount, error) =>
        failureCount < 1 &&
        (!(error instanceof ApiRequestError) ||
          error.kind === 'network' ||
          error.kind === 'server'),
      retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 5_000),
    },
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
  const handleSignOutRef = useRef<() => Promise<void>>(async () => {});
  const [selectedTask, setSelectedTask] = useState<ApiTask | null>(null);
  const [addTaskSheetVisible, setAddTaskSheetVisible] = useState(false);
  const { accessToken, loading, user, signOut, updateUser } = useAuth();
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
          if (navigationRef.isReady()) {
            if (__DEV__) console.info('[NavTrace] entering FocusSession', { source: 'widget-deep-link-resume', currentRoute: navigationRef.getCurrentRoute()?.name ?? 'none', focusHasSession: focusHasSessionRef.current });
            navigationRef.navigate('FocusSession');
          }
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
    const handledPushKeys = new Set<string>();
    const reconcileBadge = () => { void refreshUnreadNotificationCount().then(() => getUnreadCount().then(({ count }) => setBadgeCountAsync(count)).catch(() => undefined)); };
    const receivedSubscription = addNotificationReceivedListener(reconcileBadge);
    const openReminderFromResponse = (response: unknown) => {
      const data = (
        response as {
          notification?: { request?: { content?: { data?: Record<string, unknown> } } };
        }
      )?.notification?.request?.content?.data;
      const responseKey = typeof data?.notificationId === 'string' ? data.notificationId : typeof data?.id === 'string' ? data.id : undefined;
      if (responseKey && handledPushKeys.has(responseKey)) return;
      if (responseKey) handledPushKeys.add(responseKey);

      const taskId = typeof data?.taskId === 'string' ? data.taskId : typeof data?.entityId === 'string' && (data?.entityType === 'task' || data?.entityType === 'subtask') ? data.entityId : undefined;
      const commentId = typeof data?.commentId === 'string' ? data.commentId : undefined;
      const subtaskId = typeof data?.subtaskId === 'string' ? data.subtaskId : typeof data?.entityId === 'string' && data?.entityType === 'subtask' ? data.entityId : undefined;
      const route = typeof data?.route === 'string' ? data.route : '';
      const navigate = async () => {
        if (taskId) {
          if (!accessToken) { navigationRef.navigate('Notifications'); return; }
          try { await getTask(accessToken, taskId); navigationRef.navigate('TaskDetails', { taskId, commentId, subtaskId }); } catch { navigationRef.navigate('Notifications'); Alert.alert('Notification unavailable', 'That BeePlan item is no longer available.'); }
          return;
        }
        else if (route.startsWith('/focus')) navigationRef.navigate('MainTabs', { screen: 'Focus' });
        else if (route.startsWith('/calendar')) navigationRef.navigate('Calendar');
        else if (route.startsWith('/ai-planner')) navigationRef.navigate('AiDailyPlanner');
        else navigationRef.navigate('Notifications');
      };

      if (data?.notificationId && !data?.reminderId && !data?.url) {
        if (navigationRef.isReady()) void navigate(); else setTimeout(() => void navigate(), 500);
        void refreshUnreadNotificationCount();
        return;
      }

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
    return () => { subscription.remove(); receivedSubscription.remove(); };
  }, [accessToken, refreshUnreadNotificationCount]);

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
    void syncWeatherTravelNotifications(accessToken);
    const weatherSync = setInterval(() => void syncWeatherTravelNotifications(accessToken), 10 * 60_000);
    return () => clearInterval(weatherSync);
  }, [user, accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    const acknowledge = (response: unknown) => {
      const data = (response as any)?.notification?.request?.content?.data;
      if (typeof data?.weatherTravelNotificationId === 'string') void acknowledgeWeatherTravelDelivery(accessToken, data.weatherTravelNotificationId);
    };
    void getLastNotificationResponseAsync().then((response) => { if (response) acknowledge(response); });
    const subscription = addNotificationResponseReceivedListener(acknowledge);
    return () => subscription.remove();
  }, [accessToken]);

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
  const [sharedFocusForegroundActive, setSharedFocusForegroundActive] = useState(false);
  const [sharedStartup, setSharedStartup] = useState<{ resolved: boolean; roomId: string | null }>({ resolved: false, roomId: null });

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

  // Resolve Shared Focus from its server-backed room snapshot before choosing a
  // foreground focus experience. Unknown Shared Focus state must not be
  // treated as absent while local AsyncStorage is hydrating.
  useEffect(() => {
    let active = true;
    if (!user || !accessToken) {
      setSharedStartup({ resolved: true, roomId: null });
      return;
    }
    if (__DEV__) console.info('[StartupFocus] shared hydration start');
    setSharedStartup({ resolved: false, roomId: null });
    void listRooms(accessToken)
      .then((rooms) => {
        const shared = rooms.find((room) => room.isCurrentUserMember && (room.commitment?.status === 'active' || room.commitment?.status === 'break'));
        if (!active) return;
        if (__DEV__) console.info(`[StartupFocus] shared hydration complete active=${Boolean(shared)}${shared ? ` roomId=${shared.id}` : ''}`);
        setSharedStartup({ resolved: true, roomId: shared?.id ?? null });
      })
      .catch(() => { if (active) setSharedStartup({ resolved: true, roomId: null }); });
    return () => { active = false; };
  }, [accessToken, user?.id]);

  // Restore one focus foreground once after both local and Shared hydration.
  const focusRestoredRef = useRef(false);
  const deletingTaskRef = useRef<Promise<void> | null>(null);
  useEffect(() => {
    if (focusRestoredRef.current || !user || !focus.hydrated || !sharedStartup.resolved) return;
    const currentRoute = navigationRef.getCurrentRoute()?.name;
    if (__DEV__) console.info(`[StartupFocus] local hydration complete hasSession=${focus.hasSession}`);
    if (sharedStartup.roomId) {
      focusRestoredRef.current = true;
      if (__DEV__) console.info(`[StartupFocus] restoring route=FocusRooms roomId=${sharedStartup.roomId}`);
      navigationRef.navigate('FocusRooms', { roomId: sharedStartup.roomId });
    } else if (focus.hasSession && !sharedFocusForegroundActive && currentRoute !== 'FocusRooms') {
      focusRestoredRef.current = true;
      if (__DEV__) console.info('[StartupFocus] restoring route=FocusSession');
      navigationRef.navigate('FocusSession');
    }
  }, [user, focus.hydrated, focus.hasSession, sharedStartup.resolved, sharedStartup.roomId, sharedFocusForegroundActive]);

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
  handleSignOutRef.current = handleSignOut;

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

  const NotificationsStackRoute = useCallback((props: NativeStackScreenProps<RootStackParamList, 'Notifications'>) => (
    <NotificationsScreen
      onBack={() => props.navigation.goBack()}
      onSignOut={() => void handleSignOutRef.current()}
      onOpenNotification={(notification) => {
        const destination = notificationDestination(notification);
        if (!destination || destination.screen === 'Notifications') return;
        if (destination.screen === 'ReminderDetails') { props.navigation.navigate('ReminderDetails', { reminderId: destination.reminderId }); return; }
        if (destination.screen === 'TaskDetails') { props.navigation.navigate('TaskDetails', { taskId: destination.taskId, commentId: destination.commentId, subtaskId: destination.subtaskId }); return; }
        if (destination.screen === 'AiCollaboration') { props.navigation.navigate('AiCollaboration', { taskId: destination.taskId }); return; }
        if (destination.screen === 'Calendar') { props.navigation.navigate('Calendar'); return; }
        if (destination.screen === 'Focus') { props.navigation.navigate('MainTabs', { screen: 'Focus' }); return; }
        if (destination.screen === 'AiDailyPlanner') { props.navigation.navigate('AiDailyPlanner'); }
      }}
      onUnreadCountChange={setUnreadNotificationCount}
    />
  ), []);

  // Stage 2A adapter: Dashboard is navigator-backed; destinations remain on
  // the legacy flow until their own tab/stack migrations land.
  const DashboardTab = () => {
    const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>();
    const rootNavigation = navigation.getParent<import('@react-navigation/native-stack').NativeStackNavigationProp<RootStackParamList>>();
    return (<>
    <TasksDashboardScreen
      dashboard={summary}
      accessToken={accessToken ?? undefined}
      onOpenTask={(taskId) => rootNavigation?.navigate('TaskDetails', { taskId })}
      onOpenRandomStart={() => rootNavigation?.navigate('RandomStart')}
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
      onViewSettings={() => rootNavigation?.navigate('Settings')}
      onViewCalendar={() => rootNavigation?.navigate('Calendar')}
      onViewAiDailyPlanner={() => rootNavigation?.navigate('AiDailyPlanner')}
      onViewNotifications={() => rootNavigation?.navigate('Notifications')}
      unreadCount={unreadNotificationCount}
      onStartFocus={async (item) => { const started = await focus.start({ id: item.taskId, title: item.taskTitle, subtaskId: item.subtaskId, subtaskTitle: item.subtaskTitle }, 'pomodoro', item.estimatedMinutes ?? 25); if (started) { if (__DEV__) console.info('[NavTrace] entering FocusSession', { source: 'dashboard-start-local-focus', focusHasSession: focus.hasSession, localSessionId: focus.active?.sessionId ?? 'new' }); rootNavigation?.navigate('FocusSession'); } }}
      onContinueFocus={() => { if (__DEV__) console.info('[NavTrace] entering FocusSession', { source: 'dashboard-continue-local-focus', focusHasSession: focus.hasSession, localSessionId: focus.active?.sessionId ?? 'none' }); rootNavigation?.navigate('FocusSession'); }}
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
        onOpenWorkspace={() => { if (__DEV__) console.info('[NavTrace] entering FocusSession', { source: 'focus-tab-open-local-workspace', focusHasSession: focus.hasSession, localSessionId: focus.active?.sessionId ?? 'none' }); rootNavigation?.navigate('FocusSession'); }}
        onOpenRooms={() => rootNavigation?.navigate('FocusRooms')}
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
      onAddToAchievement={() => props.navigation.navigate('AchievementMuseum', { taskId: props.route.params.taskId })}
      onViewAchievement={(achievementId) => props.navigation.navigate('AchievementMuseum', { achievementId })}
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
  const FocusSessionStackRoute = (props: NativeStackScreenProps<RootStackParamList, 'FocusSession'>) => (
    <FocusSessionScreen focus={focus} tasks={tasks} onExit={() => {
      if (props.navigation.canGoBack()) props.navigation.goBack()
      else props.navigation.reset({ index: 0, routes: [{ name: 'MainTabs', params: { screen: 'Focus' } }] })
    }} />
  );
  const RandomStartStackRoute = ({ navigation }: NativeStackScreenProps<RootStackParamList, 'RandomStart'>) => (
    <RandomStartScreen
      accessToken={accessToken ?? ''}
      onBack={() => navigation.goBack()}
      onViewTask={(taskId) => navigation.navigate('TaskDetails', { taskId })}
      onStartFocus={async (task) => {
        const started = await focus.start({ id: task.taskId ?? task.id, title: task.parentTitle ?? task.title, subtaskId: task.itemType === 'subtask' ? task.id : undefined, subtaskTitle: task.itemType === 'subtask' ? task.title : undefined }, 'pomodoro', task.estimatedTimeMinutes ?? 25)
        if (started) { if (__DEV__) console.info('[NavTrace] entering FocusSession', { source: 'random-start-local-focus', focusHasSession: focus.hasSession, localSessionId: focus.active?.sessionId ?? 'new' }); navigation.replace('FocusSession') }
      }}
    />
  );
  // React Navigation treats a changed `component` reference as a replacement.
  // Keep this route component stable across dashboard/session renders so an
  // active Shared Focus room is not unmounted back to its lobby.
  const FocusRoomsStackRoute = useCallback((props: NativeStackScreenProps<RootStackParamList, 'FocusRooms'>) => (
    <FocusRoomsScreen accessToken={accessToken ?? ''} initialRoomId={props.route.params?.roomId} onBack={() => props.navigation.goBack()} onSharedFocusForegroundChange={setSharedFocusForegroundActive} />
  ), [accessToken]);
  const AiTaskBuilderStackRoute = (props: NativeStackScreenProps<RootStackParamList, 'AiTaskBuilder'>) => (
    <AiTaskBuilderScreen accessToken={accessToken ?? ''} onCancel={() => {
      if (props.navigation.canGoBack()) props.navigation.goBack()
      else props.navigation.reset({ index: 0, routes: [{ name: 'MainTabs', params: { screen: 'Tasks' } }] })
    }} onSaveTask={handleCreateTask} onReminderCreated={(reminder) => setReminders((current) => [reminder, ...current])}
    onSaved={(task) => props.navigation.replace('TaskDetails', { taskId: task.id })} />
  );
  const AiDailyPlannerStackRoute = (props: NativeStackScreenProps<RootStackParamList, 'AiDailyPlanner'>) => (
    <AiDailyPlannerScreen accessToken={accessToken ?? ''} onBack={() => props.navigation.goBack()} onPlanAccepted={loadDashboardSummary} />
  );
  const CalendarStackRoute = (props: NativeStackScreenProps<RootStackParamList, 'Calendar'>) => (
    <CalendarScreen accessToken={accessToken ?? ''} tasks={tasks} reminders={reminders} onBack={() => props.navigation.goBack()} onTask={(taskId) => props.navigation.navigate('TaskDetails', { taskId })} onReminder={(reminderId) => props.navigation.navigate('ReminderDetails', { reminderId })} onCreateTask={(params) => props.navigation.navigate('CreateTask', params)} />
  );
  const NotesStackRoute = (props: NativeStackScreenProps<RootStackParamList, 'Notes'>) => (
    <NotesScreen accessToken={accessToken ?? ''} onBack={() => props.navigation.goBack()} />
  );
  const SettingsStackRoute = (props: NativeStackScreenProps<RootStackParamList, 'Settings'>) => (
    <SettingsScreen
      accessToken={accessToken ?? ''}
      user={user!}
      onUserUpdated={(updated) => void updateUser(updated)}
      onBack={() => props.navigation.goBack()}
      onSignOut={() => void handleSignOut()}
      onOpenPlanner={() => props.navigation.navigate('AiDailyPlanner')}
      onOpenTimeCapsules={() => props.navigation.navigate('TimeCapsules')}
    />
  );
  const AnalyticsStackRoute = (props: NativeStackScreenProps<RootStackParamList, 'Analytics'>) => (
    <AnalyticsScreen accessToken={accessToken ?? ''} onBack={() => props.navigation.goBack()} />
  );
  const FeedbackStackRoute = (props: NativeStackScreenProps<RootStackParamList, 'Feedback'>) => <FeedbackScreen accessToken={accessToken ?? ''} onBack={() => props.navigation.goBack()} onOpen={(feedbackId) => props.navigation.navigate('FeedbackDetail', { feedbackId })} />;
  const FeedbackDetailStackRoute = (props: NativeStackScreenProps<RootStackParamList, 'FeedbackDetail'>) => <FeedbackDetailScreen accessToken={accessToken ?? ''} id={props.route.params.feedbackId} onBack={() => props.navigation.goBack()} />;
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
  if (loading) {
    return (
      <View style={{ alignItems: 'center', backgroundColor: theme.colors.background, flex: 1, justifyContent: 'center' }}>
        <StatusBar backgroundColor={theme.colors.background} style={theme.statusBarStyle} translucent />
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  if (user) {
    return (
      <StrictFocusProvider active={focus.active} remainingMs={focus.remainingMs}>
        <RootNavigator tabScreens={{ Dashboard: DashboardTab, Tasks: TasksTab, Focus: FocusTab, Reminders: RemindersTab, People: PeopleTab }} taskDetailsRoute={TaskDetailsStackRoute} createTaskRoute={CreateTaskStackRoute} editTaskRoute={EditTaskStackRoute} aiTaskBuilderRoute={AiTaskBuilderStackRoute} aiDailyPlannerRoute={AiDailyPlannerStackRoute} calendarRoute={CalendarStackRoute} notesRoute={NotesStackRoute} analyticsRoute={AnalyticsStackRoute} aiCollaborationRoute={AiCollaborationStackRoute} focusSessionRoute={FocusSessionStackRoute} randomStartRoute={RandomStartStackRoute} focusRoomsRoute={FocusRoomsStackRoute} reminderDetailsRoute={ReminderDetailsStackRoute} createReminderRoute={CreateReminderStackRoute} editReminderRoute={EditReminderStackRoute} notificationsRoute={NotificationsStackRoute} settingsRoute={SettingsStackRoute} timeCapsulesRoute={TimeCapsulesScreen} feedbackRoute={FeedbackStackRoute} feedbackDetailRoute={FeedbackDetailStackRoute} />
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
