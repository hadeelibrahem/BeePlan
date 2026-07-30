import { useState } from 'react';
import { Text, View } from 'react-native';
import { AppScreen, FilterTabs, PageHeader, SectionCard } from '../components/layout';
import { useTheme } from '../theme/useTheme';
import type { ApiTask } from '../lib/tasksApi';
import { HistoryFeed } from '../features/collaboration/components/ai/HistoryFeed';
import { OverviewPanel } from '../features/collaboration/components/ai/OverviewPanel';
import { PlanView } from '../features/collaboration/components/ai/PlanView';
import { ProjectHealthPanel } from '../features/collaboration/components/ai/ProjectHealthPanel';
import { TeamMemberList } from '../features/collaboration/components/ai/TeamMemberList';
import type { PlanFocus } from '../features/collaboration/api/ai-collaboration.api';

export type StartCollaborationFocusInput = {
  taskId: string;
  subtaskId: string | null;
  estimatedMinutes: number | null;
};

type Props = {
  task: ApiTask | null;
  accessToken?: string;
  onBack: () => void;
  onStartFocus?: (input: StartCollaborationFocusInput) => void;
};

type TabKey = 'overview' | 'plan' | 'team' | 'health' | 'activity';

const TABS: { value: TabKey; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'plan', label: 'Plan' },
  { value: 'team', label: 'Team' },
  { value: 'health', label: 'Health' },
  { value: 'activity', label: 'Activity' },
];

/**
 * Persistent, tabbed "AI Collaboration" home for a shared task. Five tabs —
 * Overview / Plan / Team / Health / Activity — so related data lives together
 * without duplication.
 *
 * Overview is the command centre and hosts the AI decision loop (see
 * SuggestionsFeed): every recommendation is explained, previewed against the
 * real forecast, and applied only on an explicit editor/owner approval. Findings
 * deep-link into Plan or Team carrying backend-provided filters.
 */
export default function AiCollaborationScreen({ task, accessToken = '', onBack, onStartFocus }: Props) {
  const { theme } = useTheme();
  const { colors } = theme;
  const [tab, setTab] = useState<TabKey>('overview');
  // Deep-link focus from an Overview recommendation or alert. Cleared when the
  // user switches tabs themselves, so it never silently re-filters a later visit.
  const [focus, setFocus] = useState<PlanFocus | undefined>();

  const navigateToTab = (next: TabKey, nextFocus?: PlanFocus) => {
    setFocus(nextFocus);
    setTab(next);
  };

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

      <FilterTabs tabs={TABS} active={tab} onChange={(next) => navigateToTab(next)} />

      {tab === 'overview' ? (
        <OverviewPanel
          taskId={task.id}
          onNavigate={navigateToTab}
          onStartFocus={onStartFocus}
          onViewDetails={onBack}
        />
      ) : tab === 'plan' ? (
        <PlanView taskId={task.id} initialFocus={focus} />
      ) : tab === 'team' ? (
        <View>
          <TeamMemberList taskId={task.id} initialFocus={focus} />
        </View>
      ) : tab === 'health' ? (
        <ProjectHealthPanel taskId={task.id} onNavigate={navigateToTab} />
      ) : (
        <HistoryFeed taskId={task.id} accessToken={accessToken} />
      )}
    </AppScreen>
  );
}
