import './global.css';

import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { Text, Pressable, View } from 'react-native';
import { fetchHealth } from './src/lib/api';
import { useAppStore } from './src/store/useAppStore';

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <HomeScreen />
    </QueryClientProvider>
  );
}

function HomeScreen() {
  const { onboardingDone, setOnboardingDone } = useAppStore();
  const healthQuery = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    retry: false,
  });

  return (
    <View className="flex-1 bg-zinc-950 px-6 py-14">
      <StatusBar style="light" />
      <View className="flex-1 justify-between">
        <View>
          <Text className="text-sm font-semibold uppercase tracking-widest text-cyan-300">
            BeePlan mobile
          </Text>
          <Text className="mt-4 text-4xl font-bold text-white">
            Expo app is ready.
          </Text>
          <Text className="mt-4 text-base leading-7 text-zinc-300">
            NativeWind, React Query, Zod, and Zustand are wired in.
          </Text>
        </View>

        <View className="gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <Text className="text-lg font-semibold text-white">API status</Text>
          <Text className="text-zinc-300">
            {healthQuery.isLoading
              ? 'Checking API...'
              : healthQuery.data
                ? `${healthQuery.data.service} online`
                : 'API not reachable yet'}
          </Text>
          <Pressable
            className="rounded-lg bg-cyan-300 px-4 py-3"
            onPress={() => setOnboardingDone(!onboardingDone)}
          >
            <Text className="text-center font-semibold text-zinc-950">
              Onboarding: {onboardingDone ? 'done' : 'pending'}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
