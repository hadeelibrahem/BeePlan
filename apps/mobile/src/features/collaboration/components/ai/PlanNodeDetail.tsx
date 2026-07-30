import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { OutlineButton } from '../../../../components/layout';
import { useTheme } from '../../../../theme/useTheme';
import { formatDuration } from '../../../../lib/subtasks';
import type { ProjectPlanNode, ProjectPlanSchedule } from '../../api/project-plan.api';

type Props = {
  node: ProjectPlanNode | null;
  nodesById: Map<string, ProjectPlanNode>;
  onClose: () => void;
  schedule?: ProjectPlanSchedule;
  /** Backend forecast flag: the node's assignee is over capacity in the forecast window. */
  overloaded?: boolean;
};

const STATUS_LABEL: Record<string, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
  missed: 'Missed',
};

function formatDate(value: string | null): string {
  if (!value) return 'None';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'None';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

/**
 * The ONE detail surface shared by the Dependency Graph (node tap) and the
 * Timeline (row tap) on mobile — the exact mobile analogue of the web
 * PlanNodeDetail, so the two views can never drift. Pure presentation over the
 * backend-normalized node.
 */
export function PlanNodeDetail({ node, nodesById, schedule, overloaded = false, onClose }: Props) {
  const { theme } = useTheme();
  const { colors } = theme;
  if (!node) return null;

  const titlesFor = (ids: string[]) => ids.map((id) => nodesById.get(id)?.title ?? 'Unknown item');
  const forecastStatus = schedule?.forecastStatus;
  const resourceDelayMinutes = schedule?.resourceConflictMinutes ?? 0;
  // The resource-aware forecast window takes precedence over the dependency-only one.
  const forecastStart = schedule?.forecastStart ?? node.forecastStart;
  const forecastEnd = schedule?.forecastEnd ?? node.forecastEnd;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }} onPress={onClose}>
        <Pressable
          className="rounded-t-3xl p-5"
          style={{ backgroundColor: colors.card, maxHeight: '85%' }}
          onPress={() => {}}
        >
          <ScrollView>
            <Text className="text-lg font-black" style={{ color: colors.text }}>
              {node.title}
            </Text>
            <Text className="mb-3 text-xs" style={{ color: colors.secondaryText }}>
              {node.entityType === 'subtask' ? 'Subtask' : 'Task'}
            </Text>

            <View className="mb-3 flex-row flex-wrap gap-1.5">
              <Badge text={STATUS_LABEL[node.status] ?? node.status} color={node.isBlocked ? colors.error : colors.secondaryText} colors={colors} />
              {node.isBlocked ? <Badge text="Blocked" color={colors.error} colors={colors} /> : null}
              {node.inCycle ? <Badge text="In a cycle" color={colors.error} colors={colors} /> : null}
              {node.isExternal ? <Badge text="Other task" color={colors.warning} colors={colors} /> : null}
              {schedule?.isCritical ? <Badge text="Critical path" color={colors.error} colors={colors} /> : null}
              {resourceDelayMinutes > 0 ? <Badge text="Resource delayed" color={colors.error} colors={colors} /> : null}
              {forecastStatus === 'unscheduled' || forecastStatus === 'in_cycle' ? <Badge text="Unscheduled" color={colors.warning} colors={colors} /> : null}
              {overloaded ? <Badge text="Over capacity" color={colors.error} colors={colors} /> : null}
            </View>

            <Field label="Owner" value={node.assignee?.displayName ?? 'Unassigned'} colors={colors} />
            <Field label="Due date" value={formatDate(node.dueDate)} colors={colors} />
            <Field label="Estimated" value={node.estimatedMinutes != null ? formatDuration(node.estimatedMinutes) || '0 min' : '—'} colors={colors} />
            <Field label="Actual" value={node.actualMinutes != null ? formatDuration(node.actualMinutes) || '0 min' : '—'} colors={colors} />
            <Field label="Remaining" value={node.remainingMinutes != null ? formatDuration(node.remainingMinutes) || '0 min' : '—'} colors={colors} />
            <Field label="Progress" value={`${node.progressPercent}%`} colors={colors} />
            <Field label="Planned" value={windowLabel(node.plannedStart, node.plannedEnd)} colors={colors} />
            <Field label="Forecast" value={windowLabel(forecastStart, forecastEnd)} colors={colors} />
            <Field label="Resource delay" value={resourceDelayMinutes > 0 ? `${formatFloatHours(resourceDelayMinutes)} waiting` : 'None'} colors={colors} />
            <Field label="Scheduling flexibility" value={schedule?.isCritical ? 'On the critical path' : schedule?.totalFloatMinutes != null ? formatFloatHours(schedule.totalFloatMinutes) : '—'} colors={colors} />
            {schedule?.forecastReason ? <Text className="mt-2 rounded-lg px-2 py-2 text-xs" style={{ color: colors.text, backgroundColor: colors.surfaceElevated }}>Forecast · {schedule.forecastReason}</Text> : null}
            {overloaded ? <Text className="mt-2 rounded-lg px-2 py-2 text-xs" style={{ color: colors.error, backgroundColor: colors.surfaceElevated }}>Capacity impact · this item's assignee is over capacity in the forecast window.</Text> : null}

            {node.focusSummary ? (
              <Text className="mt-2 text-xs" style={{ color: colors.secondaryText }}>
                Focus: {node.focusSummary.sessionCount} session{node.focusSummary.sessionCount === 1 ? '' : 's'} ·{' '}
                {formatDuration(node.focusSummary.spentMinutes) || '0 min'} tracked
              </Text>
            ) : null}

            <DependencyList label="Blocked by" titles={titlesFor(node.blockedByIds)} emptyLabel="Nothing — ready to start" colors={colors} />
            <DependencyList label="Blocking" titles={titlesFor(node.blockingIds)} emptyLabel="Nothing downstream" colors={colors} />

            <View className="mt-4">
              <OutlineButton onPress={onClose}>Close</OutlineButton>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

type Colors = ReturnType<typeof useTheme>['theme']['colors'];

function windowLabel(start: string | null, end: string | null): string {
  if (!start && !end) return '—';
  return `${start ? formatDate(start) : '?'} → ${end ? formatDate(end) : '?'}`;
}

function formatFloatHours(minutes: number): string {
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

function Field({ label, value, colors }: { label: string; value: string; colors: Colors }) {
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

function DependencyList({ label, titles, emptyLabel, colors }: { label: string; titles: string[]; emptyLabel: string; colors: Colors }) {
  return (
    <View className="mt-3">
      <Text className="mb-1 text-[10px] font-black uppercase tracking-wide" style={{ color: colors.secondaryText }}>
        {label}
      </Text>
      {titles.length ? (
        <View className="gap-1">
          {titles.map((title, i) => (
            <Text key={`${title}-${i}`} className="rounded-lg border px-2 py-1 text-xs" style={{ borderColor: colors.border, color: colors.text }}>
              {title}
            </Text>
          ))}
        </View>
      ) : (
        <Text className="text-xs" style={{ color: colors.secondaryText }}>
          {emptyLabel}
        </Text>
      )}
    </View>
  );
}

function Badge({ text, color, colors }: { text: string; color: string; colors: Colors }) {
  return (
    <Text
      className="rounded-full px-2 py-0.5 text-[10px] font-black uppercase"
      style={{ color, backgroundColor: colors.surfaceElevated }}
    >
      {text}
    </Text>
  );
}
