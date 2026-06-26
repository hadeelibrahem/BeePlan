import './global.css';

import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Text, Pressable, ScrollView, View } from 'react-native';
import { fetchHealth } from './src/lib/api';
import { useAppStore } from './src/store/useAppStore';
import AuthScreen from './src/screens/AuthScreen';
import ForgotPasswordScreen from './src/screens/ForgotPasswordScreen';
import ResetPasswordScreen from './src/screens/ResetPasswordScreen';

const queryClient = new QueryClient();

type AppScreen = 'auth' | 'forgot' | 'reset' | 'home';

export default function App() {
  const [screen, setScreen] = useState<AppScreen>('auth');
  const [userEmail, setUserEmail] = useState<string>('');

  return (
    <QueryClientProvider client={queryClient}>
      <View className="flex-1 bg-[#2B323F]">
        <StatusBar style="light" />
        {screen === 'auth' && (
          <AuthScreen
            onSuccess={(email) => { setUserEmail(email); setScreen('home'); }}
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
        {screen === 'home' && (
          <HomeScreen email={userEmail} onSignOut={() => { setUserEmail(''); setScreen('auth'); }} />
        )}
      </View>
    </QueryClientProvider>
  );
}

interface HomeScreenProps {
  email: string;
  onSignOut: () => void;
}

function HomeScreen({ email, onSignOut }: HomeScreenProps) {
  const { onboardingDone, setOnboardingDone } = useAppStore();
  const healthQuery = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    retry: false,
  });

  return (
    <ScrollView className="flex-1 bg-[#2B323F]" contentContainerClassName="px-5 pb-8 pt-14">
      <View className="mb-6 flex-row items-center justify-between">
        <View>
          <Text className="text-xs font-bold uppercase tracking-widest text-[#FDEF4B]">
            BeePlan
          </Text>
          <Text className="mt-1 text-2xl font-black text-white">Today</Text>
        </View>
        <Pressable
          className="rounded-full border border-[#566277] px-4 py-2 active:bg-[#353D4E]"
          onPress={onSignOut}
        >
          <Text className="text-xs font-bold text-white">Sign out</Text>
        </Pressable>
      </View>

      <View className="mb-5 rounded-[28px] bg-[#FDEF4B] p-5">
        <Text className="text-xs font-bold uppercase tracking-widest text-[#2B323F]/70">
          Welcome back
        </Text>
        <Text className="mt-2 text-3xl font-black text-[#2B323F]">
          Your plans are waiting.
        </Text>
        <Text className="mt-3 text-sm font-semibold text-[#2B323F]/75">
          {email}
        </Text>
      </View>

      <View className="mb-5 flex-row gap-3">
        <View className="flex-1 rounded-3xl border border-[#434D62] bg-[#353D4E] p-4">
          <Text className="text-3xl font-black text-white">08</Text>
          <Text className="mt-1 text-xs font-semibold uppercase tracking-wider text-[#8C9BAE]">
            Tasks
          </Text>
        </View>
        <View className="flex-1 rounded-3xl border border-[#434D62] bg-[#353D4E] p-4">
          <Text className="text-3xl font-black text-white">03</Text>
          <Text className="mt-1 text-xs font-semibold uppercase tracking-wider text-[#8C9BAE]">
            Reminders
          </Text>
        </View>
      </View>

      <View className="mb-5 rounded-3xl border border-[#434D62] bg-[#353D4E] p-5">
        <View className="flex-row items-center justify-between">
          <Text className="text-lg font-bold text-white">API status</Text>
          <View
            className={`h-3 w-3 rounded-full ${
              healthQuery.data ? 'bg-emerald-400' : 'bg-red-400'
            }`}
          />
        </View>
        <Text className="mt-3 text-sm leading-6 text-[#C8D0DC]">
          {healthQuery.isLoading
            ? 'Checking API...'
            : healthQuery.data
              ? `${healthQuery.data.service} online`
              : 'API not reachable yet'}
        </Text>
        <Pressable
          className="mt-4 rounded-2xl bg-[#FDEF4B] px-4 py-4 active:opacity-90"
          onPress={() => healthQuery.refetch()}
        >
          <Text className="text-center font-black text-[#2B323F]">Refresh status</Text>
        </Pressable>
      </View>

      <View className="gap-3">
        {['Plan mobile layout', 'Connect Railway API', 'Prepare Supabase tables'].map(
          (task, index) => (
            <View
              className="flex-row items-center rounded-2xl border border-[#434D62] bg-[#353D4E] p-4"
              key={task}
            >
              <View className="mr-3 h-9 w-9 items-center justify-center rounded-full bg-[#2B323F]">
                <Text className="font-black text-[#FDEF4B]">{index + 1}</Text>
              </View>
              <Text className="flex-1 font-bold text-white">{task}</Text>
            </View>
          ),
        )}
      </View>
    </ScrollView>
  );
}
