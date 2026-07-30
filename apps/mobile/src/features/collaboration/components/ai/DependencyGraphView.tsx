import { useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useTheme } from '../../../../theme/useTheme';
import type { ProjectPlanEdge, ProjectPlanNode, ProjectPlanSchedule, ResourceLane } from '../../api/project-plan.api';
import { filterNodeIds, groupByLayer, nodeResourceFlags, overloadedAssigneeIds, relatedPath, type PlanFilters } from '../../lib/project-plan.view';

type Props = {
  nodes: ProjectPlanNode[];
  edges: ProjectPlanEdge[];
  filters: PlanFilters;
  selectedId: string | null;
  onSelect: (id: string) => void;
  scheduling: Record<string, ProjectPlanSchedule>;
  lanes: ResourceLane[];
  highlightCritical: boolean;
};

const STATUS_COLOR: Record<string, string> = {
  todo: '#94a3b8',
  in_progress: '#38bdf8',
  done: '#34d399',
  missed: '#fb7185',
};

/**
 * Mobile dependency graph: a simplified, vertically LAYERED view (not the
 * desktop pan/zoom canvas squeezed onto a phone). Each dependency layer is a
 * horizontally scrollable row of node cards, ordered roots-first, with an arrow
 * between layers. Tapping a card opens the shared PlanNodeDetail. Layout +
 * selection come from the shared pure view helpers.
 */
export function DependencyGraphView({ nodes, edges, filters, selectedId, onSelect, scheduling, lanes, highlightCritical }: Props) {
  const { theme } = useTheme();
  const { colors } = theme;

  const layers = useMemo(() => groupByLayer(nodes), [nodes]);
  const visibleIds = useMemo(() => filterNodeIds(nodes, filters), [nodes, filters]);
  const path = useMemo(() => (selectedId ? relatedPath(selectedId, edges) : null), [selectedId, edges]);
  const nodesById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const overloadedIds = useMemo(() => overloadedAssigneeIds(lanes), [lanes]);

  return (
    <View>
      {layers.map((group, index) => (
        <View key={group.layer}>
          <Text className="mb-1 text-[10px] font-black uppercase tracking-wide" style={{ color: colors.secondaryText }}>
            {group.nodes.some((n) => n.blockedByIds.length === 0) && group.layer === 0 ? 'Ready to start' : `Step ${group.layer + 1}`}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-1">
            <View className="flex-row gap-2">
              {group.nodes.map((node) => {
                const dimmed = !visibleIds.has(node.id) || (path ? !path.all.has(node.id) : false) || (highlightCritical && !scheduling[node.id]?.isCritical);
                const selected = node.id === selectedId;
                const accent = node.isBlocked ? colors.error : STATUS_COLOR[node.status] ?? colors.secondaryText;
                const deps = node.blockedByIds.map((id) => nodesById.get(id)?.title).filter(Boolean);
                const flags = nodeResourceFlags(node, scheduling[node.id], overloadedIds);
                const resourceBadge = flags.forecastUnscheduled ? 'Unscheduled' : flags.overCapacity ? 'Over capacity' : flags.resourceDelayed ? 'Resource delayed' : null;
                return (
                  <Pressable
                    key={node.id}
                    onPress={() => onSelect(node.id)}
                    className="rounded-2xl border p-3"
                    style={{
                      width: 180,
                      opacity: dimmed ? 0.35 : 1,
                      borderColor: selected ? colors.accent : scheduling[node.id]?.isCritical || node.isBlocked || node.inCycle ? colors.error : colors.cardBorder,
                      borderWidth: selected ? 2 : 1,
                      backgroundColor: colors.surfaceElevated,
                    }}
                  >
                    <View className="mb-1 flex-row items-center gap-2">
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: accent }} />
                      <Text className="flex-1 text-sm font-bold" style={{ color: colors.text }} numberOfLines={1}>
                        {node.title}
                      </Text>
                    </View>
                    <Text className="text-[11px]" style={{ color: colors.secondaryText }} numberOfLines={1}>
                      {node.assignee?.displayName ?? 'Unassigned'}
                    </Text>
                    <Text className="text-[11px]" style={{ color: node.isBlocked ? colors.error : colors.secondaryText }}>
                      {scheduling[node.id]?.isCritical ? 'Critical' : node.isBlocked ? 'Blocked' : `${node.progressPercent}%`}
                      {node.isExternal ? ' · other task' : ''}
                    </Text>
                    {resourceBadge ? (
                      <Text className="mt-1 text-[10px] font-black uppercase" style={{ color: flags.forecastUnscheduled ? colors.warning : colors.error }}>
                        {resourceBadge}
                      </Text>
                    ) : null}
                    {deps.length ? (
                      <Text className="mt-1 text-[10px]" style={{ color: colors.textSubtle }} numberOfLines={1}>
                        after: {deps.join(', ')}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
          {index < layers.length - 1 ? (
            <Text className="mb-2 text-center text-xs" style={{ color: colors.textSubtle }}>
              ↓
            </Text>
          ) : null}
        </View>
      ))}
      <Text className="mt-1 text-[11px]" style={{ color: colors.secondaryText }}>
        Layers run top-to-bottom in dependency order. Tap a card for details.
      </Text>
    </View>
  );
}
