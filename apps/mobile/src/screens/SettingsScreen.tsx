import { Text, View } from 'react-native';
import { AppScreen, DangerButton, PageHeader, SectionCard, SecondaryButton } from '../components/layout';
import { SavedPlacesSection } from '../features/context/components/SavedPlacesSection';
import { WeeklyCommitmentsSection } from '../features/context/components/WeeklyCommitmentsSection';
import { useTheme } from '../theme/useTheme';

type Props = {
  accessToken: string;
  onBack: () => void;
  onSignOut?: () => void;
  onOpenPlanner?: () => void;
};

/**
 * Profile / Settings. Its distinctive part is the "Personal Context" group
 * (Saved Places + Weekly Commitments) that teaches BeePlan permanent info the AI
 * uses everywhere.
 */
export default function SettingsScreen({ accessToken, onBack, onSignOut, onOpenPlanner }: Props) {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <AppScreen>
      <PageHeader title="Settings" subtitle="Profile, permanent context, and preferences" onBack={onBack} />

      <View className="gap-4 px-4">
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
