import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { EmptyState } from '../../../../components/layout';
import { useTheme } from '../../../../theme/useTheme';
import type { ProjectPlanNode, ProjectPlanSchedule, ResourceLane } from '../../api/project-plan.api';
import {
  buildTimelineRows,
  filterNodeIds,
  nodeResourceFlags,
  overloadedAssigneeIds,
  timelineDomain,
  type PlanFilters,
  type ResourceFlags,
  type TimelineRow,
} from '../../lib/project-plan.view';

type Props = {
  nodes: ProjectPlanNode[];
  filters: PlanFilters;
  selectedId: string | null;
  onSelect: (id: string) => void;
  scheduling: Record<string, ProjectPlanSchedule>;
  lanes: ResourceLane[];
  highlightCritical: boolean;
};

/**
 * Mobile timeline: each execution item as a planned bar with a progress fill,
 * an overlaid forecast bar, a shared "today" marker, and delayed / blocked /
 * unscheduled badges. Tapping a row opens the shared PlanNodeDetail. Positioning
 * comes from the shared pure view helpers — no date math here.
 */
export function PlanTimelineView({ nodes, filters, selectedId, onSelect, scheduling, lanes, highlightCritical }: Props) {
  const { theme } = useTheme();
  const { colors } = theme;

  const domain = useMemo(() => timelineDomain(nodes, undefined, scheduling), [nodes, scheduling]);
  const rows = useMemo(() => buildTimelineRows(nodes, domain, scheduling), [nodes, domain, scheduling]);
  const visibleIds = useMemo(() => filterNodeIds(nodes, filters), [nodes, filters]);
  const overloadedIds = useMemo(() => overloadedAssigneeIds(lanes), [lanes]);
  const visibleRows = rows.filter((row) => visibleIds.has(row.node.id));

  if (!visibleRows.length) {
    return <EmptyState icon="🗓" title="Nothing on the timeline" description="No items match the current filters, or this plan has no scheduled work yet." />;
  }

  const scheduled = visibleRows.filter((row) => row.hasBar);
  const unscheduled = visibleRows.filter((row) => !row.hasBar);

  return (
    <View>
      {scheduled.map((row) => (
        <TimelineBar key={row.node.id} row={row} todayFraction={domain.todayFraction} selected={row.node.id === selectedId} onSelect={() => onSelect(row.node.id)} colors={colors} schedule={scheduling[row.node.id]} flags={nodeResourceFlags(row.node, scheduling[row.node.id], overloadedIds)} dimmed={highlightCritical && !scheduling[row.node.id]?.isCritical} />
      ))}

      {unscheduled.length ? (
        <View className="mt-3">
          <Text className="mb-2 text-[10px] font-black uppercase tracking-wide" style={{ color: colors.secondaryText }}>
            Unscheduled
          </Text>
          {unscheduled.map((row) => (
            <Pressable
              key={row.node.id}
              onPress={() => onSelect(row.node.id)}
              className="mb-1 flex-row items-center justify-between rounded-xl border px-3 py-2"
              style={{ borderColor: colors.border }}
            >
              <Text className="flex-1 text-sm font-semibold" style={{ color: colors.text }} numberOfLines={1}>
                {row.node.title}
              </Text>
              <Badges node={row.node} delayed={row.isDelayed} colors={colors} flags={nodeResourceFlags(row.node, scheduling[row.node.id], overloadedIds)} />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

type Colors = ReturnType<typeof useTheme>['theme']['colors'];

function TimelineBar({
  row,
  todayFraction,
  selected,
  onSelect,
  colors,
  schedule,
  flags,
  dimmed,
}: {
  row: TimelineRow;
  todayFraction: number | null;
  selected: boolean;
  onSelect: () => void;
  colors: Colors;
  schedule: ProjectPlanSchedule | undefined;
  flags: ResourceFlags;
  dimmed: boolean;
}) {
  const start = row.plannedStartFraction ?? row.forecastStartFraction ?? 0;
  const end = row.plannedEndFraction ?? row.forecastEndFraction ?? start;
  const left = Math.min(start, end);
  const width = Math.max(0.02, Math.abs(end - left));
  const forecastLeft = row.forecastStartFraction != null ? Math.min(row.forecastStartFraction, row.forecastEndFraction ?? row.forecastStartFraction) : null;
  const forecastWidth =
    row.forecastStartFraction != null && row.forecastEndFraction != null ? Math.max(0.02, Math.abs(row.forecastEndFraction - row.forecastStartFraction)) : null;

  return (
    <Pressable
      onPress={onSelect}
      className="mb-2 rounded-xl border px-3 py-2"
      style={{ borderColor: selected ? colors.accent : schedule?.isCritical ? colors.error : colors.border, opacity: dimmed ? 0.35 : 1 }}
    >
      <View className="mb-1 flex-row items-center justify-between">
        <Text className="flex-1 text-sm font-bold" style={{ color: colors.text }} numberOfLines={1}>
          {row.node.title}
        </Text>
        <Badges node={row.node} delayed={row.isDelayed} colors={colors} critical={schedule?.isCritical} flags={flags} />
      </View>
      <View className="h-5 justify-center rounded-full" style={{ backgroundColor: colors.progressTrack }}>
        {/* Planned window with progress fill. */}
        <View className="absolute h-5 rounded-full" style={{ left: `${left * 100}%`, width: `${width * 100}%`, backgroundColor: colors.accentSoft }}>
          <View className="h-5 rounded-full" style={{ width: `${row.node.progressPercent}%`, backgroundColor: colors.accent }} />
        </View>
        {/* Forecast window. */}
        {forecastLeft != null && forecastWidth != null ? (
          <View
            className="absolute bottom-0 h-1.5 rounded-full"
            style={{ left: `${forecastLeft * 100}%`, width: `${forecastWidth * 100}%`, backgroundColor: row.isDelayed ? colors.error : colors.warning }}
          />
        ) : null}
        {/* Today marker. */}
        {todayFraction != null ? <View className="absolute top-0 h-5" style={{ left: `${todayFraction * 100}%`, width: 2, backgroundColor: colors.error }} /> : null}
      </View>
    </Pressable>
  );
}

function Badges({ node, delayed, colors, critical, flags }: { node: ProjectPlanNode; delayed: boolean; colors: Colors; critical?: boolean; flags: ResourceFlags }) {
  return (
    <View className="flex-row flex-wrap gap-1">
      {node.isBlocked ? <Badge text="Blocked" color={colors.error} colors={colors} /> : null}
      {critical ? <Badge text="Critical" color={colors.error} colors={colors} /> : null}
      {delayed ? <Badge text="Delayed" color={colors.error} colors={colors} /> : null}
      {flags.resourceDelayed ? <Badge text="Resource delayed" color={colors.error} colors={colors} /> : null}
      {flags.overCapacity ? <Badge text="Over capacity" color={colors.error} colors={colors} /> : null}
      {node.inCycle ? <Badge text="Cycle" color={colors.error} colors={colors} /> : null}
      {flags.forecastUnscheduled ? <Badge text="Unscheduled" color={colors.warning} colors={colors} /> : node.isUnscheduled ? <Badge text="No due date" color={colors.warning} colors={colors} /> : null}
    </View>
  );
}

function Badge({ text, color, colors }: { text: string; color: string; colors: Colors }) {
  return (
    <Text className="rounded-full px-2 py-0.5 text-[9px] font-black uppercase" style={{ color, backgroundColor: colors.surfaceElevated }}>
      {text}
    </Text>
  );
}
