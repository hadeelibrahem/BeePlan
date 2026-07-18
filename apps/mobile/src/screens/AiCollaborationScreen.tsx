import { useState } from 'react';
import { Text, View } from 'react-native';
import { AppScreen, FilterTabs, PageHeader, SectionCard, StatsCard } from '../components/layout';
import { useTheme } from '../theme/useTheme';
import type { ApiTask } from '../lib/tasksApi';
import { CapacityOverview } from '../features/collaboration/components/ai/CapacityOverview';
import { DistributionPanel } from '../features/collaboration/components/ai/DistributionPanel';
import { HistoryFeed } from '../features/collaboration/components/ai/HistoryFeed';
import { SuggestionsFeed } from '../features/collaboration/components/ai/SuggestionsFeed';
import { TeamProgressComb } from '../features/collaboration/components/ai/TeamProgressComb';
import { TimelineView } from '../features/collaboration/components/ai/TimelineView';
import { TodayTeamPlan } from '../features/collaboration/components/ai/TodayTeamPlan';
import { useProgressQuery, useSuggestionsQuery, useTodayQuery } from '../features/collaboration/api/ai-collaboration.api';

type Props = {
  task: ApiTask | null;
  accessToken?: string;
  onBack: () => void;
};

type TabKey = 'overview' | 'today' | 'progress' | 'distribution' | 'suggestions' | 'timeline' | 'history';

const TABS: { value: TabKey; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'today', label: 'Today' },
  { value: 'progress', label: 'Progress' },
  { value: 'distribution', label: 'Distribution' },
  { value: 'suggestions', label: 'Suggestions' },
  { value: 'timeline', label: 'Timeline' },
  { value: 'history', label: 'History' },
];

/**
 * Persistent, tabbed "AI Collaboration" home for a shared task. Replaces the
 * old one-shot AiCollaborationPlannerModal — the AI keeps proposing ideas
 * here for the life of the task, but it never changes anything on its own;
 * the owner always approves via the Suggestions tab or the Distribution
 * Accept action.
 */
export default function AiCollaborationScreen({ task, accessToken = '', onBack }: Props) {
  const { theme } = useTheme();
  const { colors } = theme;
  const [tab, setTab] = useState<TabKey>('overview');

  if (!task) {
    return (
      <AppScreen>
        <PageHeader title="AI Collaboration" onBack={onBack} />
        <SectionCard className="mb-3">
          <Text style={{ color: colors.secondaryText }}>This task could not be loaded. Go back and try again.</Text>
        </SectionCard>
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <PageHeader title="AI Collaboration" subtitle={task.title} onBack={onBack} />

      <FilterTabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'overview' ? (
        <OverviewTab taskId={task.id} />
      ) : tab === 'today' ? (
        <TodayTeamPlan taskId={task.id} />
      ) : tab === 'progress' ? (
        <TeamProgressComb taskId={task.id} />
      ) : tab === 'distribution' ? (
        <DistributionPanel task={task} />
      ) : tab === 'suggestions' ? (
        <SuggestionsFeed taskId={task.id} />
      ) : tab === 'timeline' ? (
        <TimelineView taskId={task.id} />
      ) : (
        <HistoryFeed taskId={task.id} accessToken={accessToken} />
      )}
    </AppScreen>
  );
}

function OverviewTab({ taskId }: { taskId: string }) {
  const { theme } = useTheme();
  const { colors } = theme;
  const todayQuery = useTodayQuery(taskId);
  const progressQuery = useProgressQuery(taskId);
  const suggestionsQuery = useSuggestionsQuery(taskId);

  const pendingSuggestions = (suggestionsQuery.data?.items ?? []).filter((item) => item.status === 'pending').length;

  return (
    <View>
      <SectionCard className="mb-3">
        <Text className="mb-1 text-xs font-black uppercase tracking-wide" style={{ color: colors.secondaryText }}>
          Today's Goal
        </Text>
        <Text className="text-sm leading-5" style={{ color: colors.text }}>
          {todayQuery.data?.goal || 'No specific goal set for today — steady progress is the goal.'}
        </Text>
      </SectionCard>

      <View className="mb-3 flex-row flex-wrap justify-between gap-y-3">
        <StatsCard icon="📈" value={`${Math.round(progressQuery.data?.overallPercent ?? 0)}%`} title="Overall progress" />
        <StatsCard icon="💡" value={String(pendingSuggestions)} title="Pending suggestions" />
      </View>

      <CapacityOverview taskId={taskId} />
    </View>
  );
}
