import './global.css';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import { LanguageProvider } from './src/i18n/LanguageContext';
import AuthScreen from './src/screens/AuthScreen';
import ForgotPasswordScreen from './src/screens/ForgotPasswordScreen';
import ResetPasswordScreen from './src/screens/ResetPasswordScreen';
import {
  CreateReminderScreen,
  EditReminderScreen,
  ReminderDetailsScreen,
  RemindersListScreen,
  fetchReminders,
  toggleReminderStatus,
  type Reminder,
} from './src/features/reminders';

const queryClient = new QueryClient();

type AppScreen = 'auth' | 'forgot' | 'reset' | 'reminders' | 'create' | 'details' | 'edit';

export default function App() {
  return (
    <LanguageProvider>
      <ThemeProvider>
        <ThemedApp />
      </ThemeProvider>
    </LanguageProvider>
  );
}

function ThemedApp() {
  const [screen, setScreen] = useState<AppScreen>('auth');
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { theme } = useTheme();

  useEffect(() => {
    fetchReminders().then(setReminders);
  }, []);

  const selectedReminder = reminders.find((reminder) => reminder.id === selectedId) ?? null;

  async function handleToggle(id: string) {
    const updated = await toggleReminderStatus(id);
    if (!updated) return;
    setReminders((current) => current.map((reminder) => (reminder.id === id ? updated : reminder)));
  }

  return (
    <QueryClientProvider client={queryClient}>
      <View style={{ backgroundColor: theme.colors.background, flex: 1 }}>
        <StatusBar
          backgroundColor={theme.colors.background}
          style={theme.statusBarStyle}
          translucent
        />
        {screen === 'auth' && (
          <AuthScreen
            onSuccess={() => setScreen('reminders')}
            onForgotPassword={() => setScreen('forgot')}
          />
        )}
        {screen === 'forgot' && (
          <ForgotPasswordScreen
            onBack={() => setScreen('auth')}
            onReset={() => setScreen('reset')}
          />
        )}
        {screen === 'reset' && (
          <ResetPasswordScreen
            onBack={() => setScreen('auth')}
          />
        )}
        {screen === 'reminders' && (
          <RemindersListScreen
            reminders={reminders}
            onCreate={() => setScreen('create')}
            onSelect={(id) => {
              setSelectedId(id);
              setScreen('details');
            }}
            onToggle={handleToggle}
            onSignOut={() => setScreen('auth')}
          />
        )}
        {screen === 'create' && (
          <CreateReminderScreen
            onCancel={() => setScreen('reminders')}
            onCreated={(reminder) => {
              setReminders((current) => [reminder, ...current]);
              setSelectedId(reminder.id);
              setScreen('details');
            }}
          />
        )}
        {screen === 'details' && selectedReminder && (
          <ReminderDetailsScreen
            reminder={selectedReminder}
            onBack={() => setScreen('reminders')}
            onEdit={() => setScreen('edit')}
          />
        )}
        {screen === 'edit' && selectedReminder && (
          <EditReminderScreen
            reminder={selectedReminder}
            onCancel={() => setScreen('details')}
            onSaved={(reminder) => {
              setReminders((current) => current.map((item) => (item.id === reminder.id ? reminder : item)));
              setSelectedId(reminder.id);
              setScreen('details');
            }}
          />
        )}
      </View>
    </QueryClientProvider>
  );
}
