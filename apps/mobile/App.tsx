import './global.css';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, View } from 'react-native';
import {
  CreateReminderScreen,
  EditReminderScreen,
  ReminderDetailsScreen,
  RemindersListScreen,
  fetchReminders,
  toggleReminderStatus,
  type Reminder,
} from './src/features/reminders';
import { useAuth } from './src/hooks/useAuth';
import { LanguageProvider } from './src/i18n/LanguageContext';
import { AuthProvider } from './src/providers/AuthProvider';
import AuthScreen from './src/screens/AuthScreen';
import AllTasksScreen from './src/screens/AllTasksScreen';
import CreateTaskScreen from './src/screens/CreateTaskScreen';
import EditTaskScreen from './src/screens/EditTaskScreen';
import ForgotPasswordScreen from './src/screens/ForgotPasswordScreen';
import ResetPasswordScreen from './src/screens/ResetPasswordScreen';
import TaskDetailsScreen, { type TaskDetailsTask } from './src/screens/TaskDetailsScreen';
import TasksDashboardScreen from './src/screens/TasksDashboardScreen';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';

const queryClient = new QueryClient();

type AppScreen =
  | 'auth'
  | 'forgot'
  | 'reset'
  | 'dashboard'
  | 'tasks'
  | 'createTask'
  | 'taskDetails'
  | 'editTask'
  | 'reminders'
  | 'create'
  | 'details'
  | 'edit';

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <LanguageProvider>
          <ThemeProvider>
            <ThemedApp />
          </ThemeProvider>
        </LanguageProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

function ThemedApp() {
  const [screen, setScreen] = useState<AppScreen>('auth');
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskDetailsTask | null>(null);
  const { loading, user, signOut } = useAuth();
  const { theme } = useTheme();

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
    if (!user) return;

    console.log('[App] reminders screen mounted for user — calling GET /reminders');
    fetchReminders()
      .then((fetched) => {
        console.log('[App] fetchReminders resolved with', fetched.length, 'reminder(s)');
        setReminders(fetched);
      })
      .catch((error: unknown) => {
        console.error('[App] fetchReminders failed:', error);
        const message = error instanceof Error ? error.message : 'Could not load reminders.';
        Alert.alert('Failed to load reminders', message);
      });
  }, [user]);

  const selectedReminder = reminders.find((reminder) => reminder.id === selectedId) ?? null;

  async function handleToggle(id: string) {
    try {
      const updated = await toggleReminderStatus(id);
      if (!updated) return;
      setReminders((current) => current.map((reminder) => (reminder.id === id ? updated : reminder)));
    } catch (error) {
      console.error('[App] toggleReminderStatus failed:', error);
      const message = error instanceof Error ? error.message : 'Could not update reminder.';
      Alert.alert('Failed to update reminder', message);
    }
  }

  async function handleSignOut() {
    await signOut();
    setScreen('auth');
    setSelectedId(null);
    setReminders([]);
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
          onSignOut={() => void handleSignOut()}
          onViewTasks={() => setScreen('tasks')}
          onViewReminders={() => setScreen('reminders')}
          onCreateTask={() => setScreen('createTask')}
        />
      ) : screen === 'tasks' ? (
        <AllTasksScreen
          onBackDashboard={() => setScreen('dashboard')}
          onViewReminders={() => setScreen('reminders')}
          onCreateTask={() => setScreen('createTask')}
          onViewTaskDetails={(task) => {
            setSelectedTask(task);
            setScreen('taskDetails');
          }}
        />
      ) : screen === 'createTask' ? (
        <CreateTaskScreen
          onCancel={() => setScreen('tasks')}
          onSave={() => setScreen('tasks')}
        />
      ) : screen === 'taskDetails' ? (
        <TaskDetailsScreen
          task={selectedTask}
          onBack={() => setScreen('tasks')}
          onEdit={() => setScreen('editTask')}
          onDelete={() => setScreen('tasks')}
          onMarkDone={() => setScreen('tasks')}
        />
      ) : screen === 'editTask' ? (
        <EditTaskScreen
          onBack={() => setScreen('taskDetails')}
          onCancel={() => setScreen('taskDetails')}
          onDelete={() => setScreen('tasks')}
          onSave={() => setScreen('taskDetails')}
        />
      ) : screen === 'create' ? (
        <CreateReminderScreen
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
    </View>
  );
}
