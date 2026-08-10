import { Pressable, Switch, Text, TextInput, View } from 'react-native';
import { useEffect, useState } from 'react';
import { AppScreen, DangerButton, PageHeader, SectionCard, SecondaryButton } from '../components/layout';
import { SavedPlacesSection } from '../features/context/components/SavedPlacesSection';
import { WeeklyCommitmentsSection } from '../features/context/components/WeeklyCommitmentsSection';
import { useTheme } from '../theme/useTheme';
import { WeatherTravelSettings } from '../features/settings/WeatherTravelSettings';
import { loadFocusCompletionSoundEnabled, setFocusCompletionSoundEnabled } from '../lib/focusCompletionPreferences';
import { MobileNotificationsSettings } from '../features/settings/MobileNotificationsSettings';
import { GoogleCalendarSettings } from '../features/settings/GoogleCalendarSettings';
import { AccountPrivacySection } from '../features/settings/AccountPrivacySection';
import type { AuthUser } from '../lib/api';
import { useLanguage } from '../i18n/LanguageContext';
import { defaultSharedSoundPreferences, loadSharedSoundPreferences, saveSharedSoundPreferences, type SharedSoundPreferences } from '../lib/sharedFocusSounds';
import type { ThemePreference } from '../theme/ThemeContext';
import { useFocusAudio } from '../lib/useFocusAudio';

type Props = {
  accessToken: string;
  onBack: () => void;
  onSignOut?: () => void;
  onOpenPlanner?: () => void;
  onOpenTimeCapsules?: () => void;
  user: AuthUser;
  onUserUpdated: (user: AuthUser) => void;
};

/**
 * Profile / Settings. Its distinctive part is the "Personal Context" group
 * (Saved Places + Weekly Commitments) that teaches BeePlan permanent info the AI
 * uses everywhere.
 */
export default function SettingsScreen({ accessToken, onBack, onSignOut, onOpenPlanner, onOpenTimeCapsules, user, onUserUpdated }: Props) {
  const { theme } = useTheme();
  const { colors } = theme;
  const { language, setLanguage } = useLanguage();
  const focusAudio = useFocusAudio();
  const [sharedSoundError, setSharedSoundError] = useState('');
  const { preference, setThemePreference } = useTheme();
  const [completionSoundEnabled, setCompletionSoundEnabled] = useState(true);
  const [sharedSounds, setSharedSounds] = useState<SharedSoundPreferences>(defaultSharedSoundPreferences);
  useEffect(() => { void loadFocusCompletionSoundEnabled().then(setCompletionSoundEnabled); }, []);
  useEffect(() => { void loadSharedSoundPreferences().then(setSharedSounds); }, []);
  const updateSharedSounds = (next: SharedSoundPreferences) => { setSharedSounds(next); void saveSharedSoundPreferences(next); };

  return (
    <AppScreen>
      <PageHeader title="Settings" subtitle="Profile, permanent context, and preferences" onBack={onBack} />

      <View className="gap-4 px-4">
        <SectionCard><Text className="text-sm font-black" style={{ color: colors.text }}>Time Capsule</Text><Text className="mb-3 mt-1 text-xs" style={{ color: colors.secondaryText }}>Messages waiting for your future self.</Text><SecondaryButton fullWidth onPress={onOpenTimeCapsules}>Open Time Capsule</SecondaryButton></SectionCard>
        <SectionCard><Text className="text-sm font-black" style={{ color: colors.text }}>Appearance</Text><View className="mt-2 flex-row gap-2">{(['system', 'light', 'dark'] as ThemePreference[]).map((option) => <Pressable key={option} accessibilityRole="button" accessibilityState={{ selected: preference === option }} onPress={() => setThemePreference(option)} className="flex-1 rounded-xl border px-2 py-2.5" style={{ borderColor: preference === option ? colors.accent : colors.border, backgroundColor: preference === option ? colors.accentSoft : colors.surface }}><Text className="text-center text-xs font-bold capitalize" style={{ color: colors.text }}>{option}</Text></Pressable>)}</View><Text className="mt-2 text-xs" style={{ color: colors.secondaryText }}>System follows your device appearance.</Text><View className="mt-4 flex-row items-center justify-between"><Text className="text-sm font-bold" style={{ color: colors.text }}>Language</Text><Text className="text-xs font-bold" style={{ color: colors.secondaryText }}>{language === 'ar' ? 'Arabic' : 'English'}</Text></View><View className="mt-2 flex-row gap-2">{(['en', 'ar'] as const).map((option) => <Pressable key={option} accessibilityRole="button" accessibilityState={{ selected: language === option }} onPress={() => setLanguage(option)} className="flex-1 rounded-xl border px-2 py-2.5" style={{ borderColor: language === option ? colors.accent : colors.border, backgroundColor: language === option ? colors.accentSoft : colors.surface }}><Text className="text-center text-xs font-bold" style={{ color: colors.text }}>{option === 'ar' ? 'العربية' : 'English'}</Text></Pressable>)}</View></SectionCard>
        <AccountPrivacySection accessToken={accessToken} user={user} onUpdated={onUserUpdated} />
        <View>
          <Text className="mb-1 text-xs font-black uppercase tracking-wide" style={{ color: colors.secondaryText }}>
            Personal Context
          </Text>
          <Text className="mb-2 text-xs" style={{ color: colors.secondaryText }}>
            Permanent places and recurring commitments BeePlan AI uses everywhere — parsing reminders, planning days, and scheduling around your fixed time.
          </Text>
        </View>

        <SavedPlacesSection accessToken={accessToken} />
        <WeeklyCommitmentsSection accessToken={accessToken} />
        <WeatherTravelSettings token={accessToken} />
        <MobileNotificationsSettings accessToken={accessToken} />
        <GoogleCalendarSettings accessToken={accessToken} />

        <SectionCard>
          <View className="flex-row items-center justify-between gap-4"><View className="flex-1"><Text className="text-sm font-black" style={{ color: colors.text }}>Focus completion sound</Text><Text className="mt-1 text-xs" style={{ color: colors.secondaryText }}>Play a short bell when a focus session ends.</Text></View><Switch value={completionSoundEnabled} onValueChange={(value) => { setCompletionSoundEnabled(value); void setFocusCompletionSoundEnabled(value); }} /></View>
        </SectionCard>
        <SectionCard><Text className="mb-3 text-sm font-black" style={{ color: colors.text }}>Shared Focus Sounds</Text><View className="flex-row items-center justify-between"><Text style={{ color: colors.text }}>Enable Shared Session Sounds</Text><Switch value={sharedSounds.enabled} onValueChange={value => updateSharedSounds({ ...sharedSounds, enabled: value })} /></View><Text className="mt-4 text-sm font-bold" style={{ color: colors.text }}>Master Volume</Text><View className="mt-2 flex-row items-center gap-3"><Text style={{ color: colors.secondaryText }}>0</Text><View className="flex-1"><TextInput accessibilityLabel="Master Volume" keyboardType="decimal-pad" value={String(sharedSounds.volume)} onChangeText={value => updateSharedSounds({ ...sharedSounds, volume: Math.max(0, Math.min(1, Number(value) || 0)) })} className="rounded-xl border px-3 py-2" style={{ borderColor: colors.border, color: colors.text }} /></View><Text style={{ color: colors.secondaryText }}>1</Text></View>{Object.entries(sharedSounds.events).map(([event, checked]) => <View key={event} className="mt-3 flex-row items-center justify-between"><Text style={{ color: colors.text }}>{event}</Text><Switch value={checked} onValueChange={value => updateSharedSounds({ ...sharedSounds, events: { ...sharedSounds.events, [event]: value } })} /></View>)}{sharedSoundError ? <Text style={{ color: colors.danger }}>{sharedSoundError}</Text> : null}<SecondaryButton fullWidth onPress={async () => { setSharedSoundError(''); try { const ok = await focusAudio.testSharedSound(); if (!ok) setSharedSoundError('Enable Shared Session Sounds to test playback.'); } catch { setSharedSoundError('Sound playback is unavailable right now.'); } }}>Test Sound</SecondaryButton></SectionCard>

        <SectionCard>
          <Text className="mb-2 text-sm font-black" style={{ color: colors.text }}>
            AI Preferences
          </Text>
          <SecondaryButton onPress={onOpenPlanner} fullWidth>
            Open AI Planner
          </SecondaryButton>
        </SectionCard>

        <SectionCard>
          <Text className="mb-2 text-sm font-black" style={{ color: colors.text }}>
            Account
          </Text>
          <DangerButton onPress={onSignOut} fullWidth>
            Log out
          </DangerButton>
        </SectionCard>
      </View>
    </AppScreen>
  );
}
