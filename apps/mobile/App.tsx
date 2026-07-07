import './global.css';

import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
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
import { useAuth } from './src/hooks/useAuth';
import { LanguageProvider } from './src/i18n/LanguageContext';
import { AuthProvider } from './src/providers/AuthProvider';
import AuthScreen from './src/screens/AuthScreen';
import AiTaskBuilderScreen from './src/screens/AiTaskBuilderScreen';
import AllTasksScreen from './src/screens/AllTasksScreen';
import CreateTaskScreen from './src/screens/CreateTaskScreen';
import EditTaskScreen from './src/screens/EditTaskScreen';
import FocusScreen from './src/screens/FocusScreen';
import ForgotPasswordScreen from './src/screens/ForgotPasswordScreen';
import ResetPasswordScreen from './src/screens/ResetPasswordScreen';
import TaskDetailsScreen from './src/screens/TaskDetailsScreen';
import TasksDashboardScreen from './src/screens/TasksDashboardScreen';
import { ThemeProvider } from './src/theme/ThemeContext';
import { useTheme } from './src/theme/useTheme';
import {
  changeTaskStatus,
  createTask,
  deleteTask,
  getDashboardSummary,
  getTasks,
  updateTask,
  type ApiTask,
  type DashboardSummary,
  type TaskPayload,
} from './src/lib/tasksApi';

const queryClient = new QueryClient();

type AppScreen =
  | 'auth'
  | 'forgot'
  | 'reset'
  | 'dashboard'
  | 'tasks'
  | 'focus'
  | 'createTask'
  | 'aiPlanTask'
  | 'taskDetails'
  | 'editTask'
  | 'reminders'
  | 'create'
  | 'details'
  | 'edit';

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
    () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
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

  useEffect(() => {
    if (!user || !accessToken) return;

    setTasksLoading(true);
    setTasksError('');
    getTasks(accessToken)
      .then(setTasks)
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Could not load tasks.';
        setTasksError(message);
      })
      .finally(() => setTasksLoading(false));
  }, [accessToken, user]);

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

  async function handleUpdateTask(taskId: string, payload: TaskPayload) {
    if (!accessToken) return;
    const updatedTask = await updateTask(accessToken, taskId, payload);
    setTasks((current) => current.map((item) => (item.id === taskId ? updatedTask : item)));
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
    invalidateTaskFilters();
    loadDashboardSummary();
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
      ) : screen === 'focus' ? (
        <FocusScreen
          onBackDashboard={() => setScreen('dashboard')}
          onViewReminders={() => setScreen('reminders')}
          onViewTaskDetails={(task) => {
            setSelectedTask(tasks.find((item) => item.id === task.id) ?? null);
            setScreen('taskDetails');
          }}
          tasks={tasks}
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
          onBack={() => setScreen('tasks')}
          onEdit={() => setScreen('editTask')}
          onDelete={() => void handleDeleteTask()}
          onMarkDone={() => void handleMarkTaskDone()}
          onTaskUpdated={handleTaskUpdated}
        />
      ) : screen === 'editTask' ? (
        <EditTaskScreen
          task={selectedTask}
          accessToken={accessToken ?? ''}
          onBack={() => setScreen('taskDetails')}
          onCancel={() => setScreen('taskDetails')}
          onDelete={() => void handleDeleteTask()}
          onSave={(payload) => (selectedTask ? handleUpdateTask(selectedTask.id, payload) : undefined)}
          onSaved={handleTaskSaved}
        />
      ) : screen === 'create' ? (
        <CreateReminderScreen
          accessToken={accessToken ?? ''}
          onCancel={() => setScreen('reminders')}
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
