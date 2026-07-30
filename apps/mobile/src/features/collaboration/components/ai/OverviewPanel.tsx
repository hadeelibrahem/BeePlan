import { Text, View } from 'react-native';
import { EmptyState, LoadingState, OutlineButton, PrimaryButton, SectionCard } from '../../../../components/layout';
import { useTheme } from '../../../../theme/useTheme';
import { formatDuration } from '../../../../lib/subtasks';
import {
  useOverviewQuery,
  type DoThisNow,
  type OverviewAlert,
  type PlanFocus,
  type ProjectHealth,
} from '../../api/ai-collaboration.api';
import { friendlyError } from '../../errorMessages';
import { SuggestionsFeed } from './SuggestionsFeed';

export type OverviewTab = 'plan' | 'team' | 'health';

type Props = {
  taskId: string;
  /** `focus` carries backend-provided filters so a deep link lands on the work itself. */
  onNavigate: (tab: OverviewTab, focus?: PlanFocus) => void;
  onStartFocus?: (input: {
    taskId: string;
    subtaskId: string | null;
    estimatedMinutes: number | null;
  }) => void;
  onViewDetails?: () => void;
};

const HEALTH_LABEL: Record<ProjectHealth['status'], string> = {
  complete: 'Complete',
  on_track: 'On track',
  at_risk: 'At risk',
  needs_attention: 'Needs attention',
};

const STATUS_LABEL: Record<string, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
  missed: 'Missed',
};

const ALERT_LINK_LABEL: Record<OverviewAlert['link'], string> = {
  health: 'Health',
  plan: 'Plan',
  team: 'Team',
};

function formatDate(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

/**
 * The AI Collaboration **Overview** for mobile — a concise command centre.
 * Every value comes from the backend `/overview` aggregation (no client-side
 * health scoring); each section links into the Plan / Team / Health tab that
 * owns the full report rather than duplicating it here.
 */
export function OverviewPanel({ taskId, onNavigate, onStartFocus, onViewDetails }: Props) {
  const { theme } = useTheme();
  const { colors } = theme;
  const query = useOverviewQuery(taskId);

  const healthToneColor: Record<ProjectHealth['tone'], string> = {
    success: colors.success,
    positive: colors.accent,
    warning: colors.warning,
    danger: colors.error,
  };

  if (query.isLoading) return <LoadingState rows={6} />;

  if (query.isError) {
    const status = (query.error as { status?: number })?.status;
    if (status === 403) {
      return (
        <EmptyState
          icon="🔒"
          title="No access to this overview"
          description="You don't have permission to view this project's overview."
        />
      );
    }
    return (
      <SectionCard>
        <Text className="text-sm" style={{ color: colors.error }}>
          {friendlyError(query.error, 'Could not load the overview. Please try again.')}
        </Text>
      </SectionCard>
    );
  }

  const data = query.data;
  if (!data) return null;

  const { status, doThisNow, alerts, plan, team } = data;
  const isEmpty =
    status.totalCount === 0 &&
    !doThisNow &&
    alerts.length === 0 &&
    team.contributorCount === 0 &&
    status.pendingActionCount === 0;
  if (isEmpty) {
    return (
      <EmptyState
        icon="🧭"
        title="Nothing to show yet"
        description="Once this project has work, assignees, and a plan, its command centre will appear here."
      />
    );
  }

  return (
    <View>
      {/* 1. Project status cards (team count is secondary metadata, not primary) */}
      <View className="mb-3 flex-row flex-wrap justify-between gap-y-3">
        <StatusCell label="Overall progress" value={`${status.overallPercent}%`} sub={`${status.completedCount}/${status.totalCount} done`} colors={colors} />
        <StatusCell
          label="Project health"
          value={status.health ? HEALTH_LABEL[status.health.status] : '—'}
          valueColor={status.health ? healthToneColor[status.health.tone] : colors.text}
          sub={status.health ? 'Progress · due · blockers' : 'No work yet'}
          colors={colors}
        />
        <StatusCell
          label={status.isDeadlineAtRisk ? 'Deadline · at risk' : 'Deadline'}
          value={status.deadline ? formatDate(status.deadline) : status.isDeadlineAtRisk ? 'At risk' : 'None'}
          valueColor={status.isDeadlineAtRisk ? colors.error : colors.text}
          sub={status.isDeadlineAtRisk ? 'Overdue / past finish' : 'Finish target'}
          colors={colors}
        />
        <StatusCell label="Pending actions" value={String(status.pendingActionCount)} sub={status.pendingActionCount ? 'Need your decision' : 'All caught up'} colors={colors} />
      </View>
      <Text className="mb-3 text-xs" style={{ color: colors.secondaryText }}>
        {status.teamMemberCount} contributor{status.teamMemberCount === 1 ? '' : 's'} tracked
      </Text>

      {/* 2. The decisions the "Pending actions" count above refers to. */}
      <SuggestionsFeed taskId={taskId} onNavigate={onNavigate} />

      {/* 3. Do this now */}
      <DoThisNowCard
        doThisNow={doThisNow}
        onNavigate={onNavigate}
        onStartFocus={onStartFocus}
        onViewDetails={onViewDetails}
        colors={colors}
      />

      {/* 4. Critical alerts */}
      {alerts.length ? (
        <SectionCard className="mb-3">
          <Text className="mb-3 text-xs font-black uppercase tracking-wide" style={{ color: colors.secondaryText }}>
            Critical alerts ({alerts.length})
          </Text>
          <View className="gap-2">
            {alerts.map((alert) => (
              <View key={alert.id} className="rounded-xl border p-3" style={{ borderColor: colors.border }}>
                <View className="mb-1 flex-row items-center gap-2">
                  <Text
                    className="rounded-full px-2 py-0.5 text-[10px] font-black uppercase"
                    style={{
                      color: alert.severity === 'critical' ? colors.error : colors.warning,
                      backgroundColor: colors.surfaceElevated,
                    }}
                  >
                    {alert.severity === 'critical' ? 'Critical' : 'Warning'}
                  </Text>
                  <Text className="flex-1 text-sm font-bold" style={{ color: colors.text }}>
                    {alert.title}
                  </Text>
                </View>
                <Text className="text-xs" style={{ color: colors.secondaryText }}>
                  {alert.reason}
                </Text>
                <Text className="mt-0.5 text-[11px]" style={{ color: colors.textSubtle }}>
                  Impact: {alert.impact}
                </Text>
                <View className="mt-2 flex-row justify-end">
                  <OutlineButton
                    size="sm"
                    onPress={() => onNavigate(alert.link, alert.focus)}
                  >
                    Go to {ALERT_LINK_LABEL[alert.link]}
                  </OutlineButton>
                </View>
              </View>
            ))}
          </View>
        </SectionCard>
      ) : null}

      {/* 4. Plan snapshot */}
      <SectionCard className="mb-3">
        <View className="mb-3 flex-row items-center justify-between">
          <Text className="text-xs font-black uppercase tracking-wide" style={{ color: colors.secondaryText }}>
            Plan snapshot
          </Text>
          <Text className="text-[11px] font-bold" style={{ color: colors.accentInk }} onPress={() => onNavigate('plan')}>
            Open Plan →
          </Text>
        </View>
        <Row label="Remaining work" value={plan.remainingEstimatedMinutes != null ? formatDuration(plan.remainingEstimatedMinutes) || '0 min' : 'Not estimated'} colors={colors} />
        <Row label="Blocked items" value={String(plan.blockedCount)} colors={colors} />
        <Row label="Critical path" value={plan.criticalPathSummary ?? 'Not available yet'} colors={colors} />
        <Row label="Forecast date" value={plan.forecastDate ? formatDate(plan.forecastDate) : 'Not available yet'} colors={colors} />
        <Row label="Deadline" value={plan.deadline ? formatDate(plan.deadline) : 'None set'} colors={colors} />
        <Row label="Available capacity" value={`${plan.availableCapacityMemberCount} with room`} colors={colors} />
      </SectionCard>

      {/* 5. Team snapshot */}
      <SectionCard className="mb-3">
        <View className="mb-3 flex-row items-center justify-between">
          <Text className="text-xs font-black uppercase tracking-wide" style={{ color: colors.secondaryText }}>
            Team snapshot
          </Text>
          <Text className="text-[11px] font-bold" style={{ color: colors.accentInk }} onPress={() => onNavigate('team')}>
            Open Team →
          </Text>
        </View>
        {team.contributorCount === 0 ? (
          <Text className="text-xs" style={{ color: colors.secondaryText }}>
            No contributors tracked yet.
          </Text>
        ) : (
          <View>
            <Row label="Contributors" value={String(team.contributorCount)} colors={colors} />
            <Row label="Workload balance" value={team.balance ? (team.balance === 'balanced' ? 'Balanced' : 'Uneven') : 'Not enough data'} colors={colors} />
            {team.mostOverloaded ? <Row label="Most loaded" value={`${team.mostOverloaded.displayName} · ${team.mostOverloaded.loadPercent}%`} colors={colors} /> : null}
            {team.mostAvailable ? <Row label="Most available" value={`${team.mostAvailable.displayName} · ${team.mostAvailable.loadPercent}%`} colors={colors} /> : null}
          </View>
        )}
      </SectionCard>
    </View>
  );
}

type Colors = ReturnType<typeof useTheme>['theme']['colors'];

function StatusCell({
  label,
  value,
  sub,
  valueColor,
  colors,
}: {
  label: string;
  value: string;
  sub: string;
  valueColor?: string;
  colors: Colors;
}) {
  return (
    <View className="rounded-2xl border p-3" style={{ width: '48%', borderColor: colors.cardBorder, backgroundColor: colors.surfaceElevated }}>
      <Text className="text-lg font-black" style={{ color: valueColor ?? colors.text }} numberOfLines={1}>
        {value}
      </Text>
      <Text className="mt-0.5 text-xs font-semibold" style={{ color: colors.text }}>
        {label}
      </Text>
      <Text className="text-[11px]" style={{ color: colors.secondaryText }}>
        {sub}
      </Text>
    </View>
  );
}

function DoThisNowCard({
  doThisNow,
  onNavigate,
  onStartFocus,
  onViewDetails,
  colors,
}: {
  doThisNow: DoThisNow | null;
  onNavigate: (tab: OverviewTab) => void;
  onStartFocus?: Props['onStartFocus'];
  onViewDetails?: () => void;
  colors: Colors;
}) {
  if (!doThisNow) {
    return (
      <SectionCard className="mb-3">
        <Text className="mb-2 text-xs font-black uppercase tracking-wide" style={{ color: colors.secondaryText }}>
          Do this now
        </Text>
        <EmptyState
          icon="🌱"
          title="Nothing assigned to you right now"
          description="When you have an executable item on this project, it'll appear here ready to start."
        />
      </SectionCard>
    );
  }

  const meta: string[] = [];
  if (doThisNow.assignee) meta.push(doThisNow.assignee.displayName);
  if (doThisNow.estimatedRemainingMinutes != null) meta.push(`${formatDuration(doThisNow.estimatedRemainingMinutes) || '0 min'} left`);
  if (doThisNow.dueDate) meta.push(`Due ${formatDate(doThisNow.dueDate)}`);

  return (
    <SectionCard className="mb-3">
      <View className="mb-2 flex-row items-center justify-between">
        <Text className="text-xs font-black uppercase tracking-wide" style={{ color: colors.secondaryText }}>
          Do this now
        </Text>
        <View className="flex-row gap-1.5">
          {doThisNow.isOverdue ? <Pill text="Overdue" color={colors.error} colors={colors} /> : null}
          {doThisNow.isBlocked ? <Pill text="Blocked" color={colors.warning} colors={colors} /> : null}
          <Pill text={STATUS_LABEL[doThisNow.status] ?? doThisNow.status} color={colors.secondaryText} colors={colors} />
        </View>
      </View>

      {doThisNow.kind === 'subtask' ? (
        <Text className="text-[11px] font-semibold" style={{ color: colors.secondaryText }}>
          {doThisNow.parentTaskTitle}
        </Text>
      ) : null}
      <Text className="text-base font-black" style={{ color: colors.text }}>
        {doThisNow.title}
      </Text>
      {meta.length ? (
        <Text className="mt-1 text-xs" style={{ color: colors.secondaryText }}>
          {meta.join(' · ')}
        </Text>
      ) : null}
      {doThisNow.blocksCount > 0 ? (
        <Text className="mt-1 text-[11px]" style={{ color: colors.accentInk }}>
          Unblocks {doThisNow.blocksCount} downstream item{doThisNow.blocksCount === 1 ? '' : 's'} when done
        </Text>
      ) : null}

      <View className="mt-3 flex-row flex-wrap justify-end gap-2 border-t pt-3" style={{ borderColor: colors.border }}>
        <OutlineButton size="sm" onPress={() => onNavigate('plan')}>
          Open in Plan
        </OutlineButton>
        {onViewDetails ? (
          <OutlineButton size="sm" onPress={onViewDetails}>
            View details
          </OutlineButton>
        ) : null}
        {doThisNow.canStartFocus && onStartFocus ? (
          <PrimaryButton
            size="sm"
            onPress={() =>
              onStartFocus({
                taskId: doThisNow.taskId,
                subtaskId: doThisNow.subtaskId,
                estimatedMinutes: doThisNow.estimatedRemainingMinutes,
              })
            }
          >
            Start focus
          </PrimaryButton>
        ) : null}
      </View>
    </SectionCard>
  );
}

function Row({ label, value, colors }: { label: string; value: string; colors: Colors }) {
  return (
    <View className="flex-row items-center justify-between gap-3 py-1">
      <Text className="text-xs" style={{ color: colors.secondaryText }}>
        {label}
      </Text>
      <Text className="flex-1 text-end text-sm font-semibold" style={{ color: colors.text }} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function Pill({ text, color, colors }: { text: string; color: string; colors: Colors }) {
  return (
    <Text
      className="rounded-full px-2 py-0.5 text-[10px] font-black uppercase"
      style={{ color, backgroundColor: colors.surfaceElevated }}
    >
      {text}
    </Text>
  );
}
