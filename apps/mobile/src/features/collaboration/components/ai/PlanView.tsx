import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { EmptyState, FilterTabs, LoadingState, SearchInput, SectionCard } from '../../../../components/layout';
import { useTheme } from '../../../../theme/useTheme';
import { friendlyError } from '../../errorMessages';
import { useProjectPlanQuery, type ProjectPlan, type ResourceLane, type ProjectPlanWarning } from '../../api/project-plan.api';
import {
  EMPTY_FILTERS,
  filtersFromFocus,
  formatMinutesLabel,
  hasActiveFilters,
  ownersOf,
  statusesOf,
  type PlanFilters,
} from '../../lib/project-plan.view';
import type { PlanFocus } from '../../api/ai-collaboration.api';
import { DependencyGraphView } from './DependencyGraphView';
import { PlanNodeDetail } from './PlanNodeDetail';
import { PlanTimelineView } from './PlanTimelineView';
import { TodayTeamPlan } from './TodayTeamPlan';

type Props = {
  taskId: string;
  /**
   * Filters to apply on arrival, from a deep link (a recommendation or an alert
   * on the Overview). The backend decides what a finding is "about"; this view
   * just starts filtered to it and stays fully adjustable afterwards.
   */
  initialFocus?: PlanFocus;
};

type PlanMode = 'timeline' | 'dependency-graph';

const PLAN_MODES: { value: PlanMode; label: string }[] = [
  { value: 'timeline', label: 'Timeline' },
  { value: 'dependency-graph', label: 'Dependency Graph' },
];

const STATUS_LABEL: Record<string, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
  missed: 'Missed',
};

/**
 * The "Plan" tab (mobile): one local Timeline | Dependency Graph switcher over a
 * single backend-normalized project-plan model. Both views share filters,
 * selection, and the PlanNodeDetail sheet, so a graph node and a timeline row
 * open the exact same detail. Circular data is reported in a banner, never
 * silently rendered.
 */
export function PlanView({ taskId, initialFocus }: Props) {
  const { theme } = useTheme();
  const { colors } = theme;
  const [mode, setMode] = useState<PlanMode>('timeline');
  const [filters, setFilters] = useState<PlanFilters>(() => filtersFromFocus(initialFocus));
  const [selectedId, setSelectedId] = useState<string | null>(initialFocus?.itemIds?.[0] ?? null);
  const [highlightCritical, setHighlightCritical] = useState(false);

  // A later deep link (arriving while this tab is already mounted) re-applies.
  const focusKey = initialFocus ? JSON.stringify(initialFocus) : '';
  useEffect(() => {
    if (!focusKey) return;
    const focus = JSON.parse(focusKey) as PlanFocus;
    setFilters(filtersFromFocus(focus));
    setSelectedId(focus.itemIds?.[0] ?? null);
  }, [focusKey]);

  const query = useProjectPlanQuery(taskId);
  const plan = query.data;
  const nodes = useMemo(() => plan?.nodes ?? [], [plan]);
  const nodesById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const owners = useMemo(() => ownersOf(nodes), [nodes]);
  const statuses = useMemo(() => statusesOf(nodes), [nodes]);
  const selectedNode = selectedId ? nodesById.get(selectedId) ?? null : null;

  return (
    <View>
      <FilterTabs tabs={PLAN_MODES} active={mode} onChange={setMode} />

      {query.isLoading ? (
        <LoadingState rows={5} />
      ) : query.isError ? (
        (query.error as { status?: number })?.status === 403 ? (
          <EmptyState icon="🔒" title="No access to this plan" description="You don't have permission to view this project's plan." />
        ) : (
          <SectionCard>
            <Text className="text-sm" style={{ color: colors.error }}>
              {friendlyError(query.error, 'Could not load the plan. Please try again.')}
            </Text>
          </SectionCard>
        )
      ) : !plan || !nodes.length ? (
        <EmptyState icon="🗂" title="No plan yet" description="Add subtasks or dependencies and they'll appear here as a timeline and a dependency graph." />
      ) : (
        <View>
          <WarningBanner warnings={plan.warnings} colors={colors} />
          <CriticalPathSummary plan={plan} highlighted={highlightCritical} onFocus={() => setHighlightCritical((value) => !value)} colors={colors} />
          <ForecastSummary plan={plan} colors={colors} />
          <ResourceLanesPanel lanes={plan.resourceLanes} colors={colors} />

          <View className="mb-2">
            <SearchInput value={filters.search} onChangeText={(value) => setFilters((f) => ({ ...f, search: value }))} placeholder="Search items…" />
          </View>
          <ChipRow
            label="Owner"
            options={[{ id: null, label: 'All' }, ...owners.map((o) => ({ id: o.userId, label: o.displayName }))]}
            activeId={filters.ownerId}
            onSelect={(id) => setFilters((f) => ({ ...f, ownerId: id }))}
            colors={colors}
          />
          <ChipRow
            label="Status"
            options={[{ id: null, label: 'All' }, ...statuses.map((s) => ({ id: s, label: STATUS_LABEL[s] ?? s }))]}
            activeId={filters.status}
            onSelect={(id) => setFilters((f) => ({ ...f, status: id }))}
            colors={colors}
          />
          <View className="mb-3 flex-row flex-wrap items-center gap-2">
            <Pressable
              onPress={() => setFilters((f) => ({ ...f, blockedOnly: !f.blockedOnly }))}
              className="self-start rounded-full px-3 py-1"
              accessibilityRole="button"
              accessibilityState={{ selected: filters.blockedOnly }}
              style={{ backgroundColor: filters.blockedOnly ? colors.accent : colors.surfaceElevated }}
            >
              <Text className="text-xs font-bold" style={{ color: filters.blockedOnly ? colors.accentText : colors.secondaryText }}>
                Blocked only
              </Text>
            </Pressable>

            {filters.itemIds ? (
              <Pressable
                onPress={() => setFilters((f) => ({ ...f, itemIds: null }))}
                className="self-start rounded-full px-3 py-1"
                accessibilityRole="button"
                accessibilityLabel="Stop filtering to the linked items"
                style={{ backgroundColor: `${colors.accent}26` }}
              >
                <Text className="text-xs font-bold" style={{ color: colors.accentInk }}>
                  Showing {filters.itemIds.length} linked item{filters.itemIds.length === 1 ? '' : 's'} ×
                </Text>
              </Pressable>
            ) : null}

            {hasActiveFilters(filters) ? (
              <Pressable
                onPress={() => setFilters(EMPTY_FILTERS)}
                accessibilityRole="button"
                accessibilityLabel="Clear all plan filters"
              >
                <Text className="text-xs font-bold" style={{ color: colors.accentInk }}>
                  Clear filters
                </Text>
              </Pressable>
            ) : null}
          </View>

          <SectionCard className="mb-3">
            {mode === 'timeline' ? (
              <PlanTimelineView nodes={nodes} filters={filters} selectedId={selectedId} onSelect={setSelectedId} scheduling={plan.scheduling} lanes={plan.resourceLanes} highlightCritical={highlightCritical} />
            ) : (
              <DependencyGraphView nodes={nodes} edges={plan.edges} filters={filters} selectedId={selectedId} onSelect={setSelectedId} scheduling={plan.scheduling} lanes={plan.resourceLanes} highlightCritical={highlightCritical} />
            )}
          </SectionCard>

          {mode === 'timeline' ? <TodayTeamPlan taskId={taskId} /> : null}

          <PlanNodeDetail
            node={selectedNode}
            nodesById={nodesById}
            schedule={selectedId ? plan.scheduling[selectedId] : undefined}
            overloaded={Boolean(selectedNode?.assignee && plan.resourceLanes.some((l) => l.assigneeId === selectedNode.assignee!.userId && l.overloadMinutes > 0))}
            onClose={() => setSelectedId(null)}
          />
        </View>
      )}
    </View>
  );
}

function CriticalPathSummary({ plan, highlighted, onFocus, colors }: { plan: ProjectPlan; highlighted: boolean; onFocus: () => void; colors: Colors }) {
  if (plan.criticalPath.status === 'unavailable') return <View className="mb-3 rounded-2xl border p-3" style={{ borderColor: colors.warning }}><Text className="text-sm font-black" style={{ color: colors.text }}>Critical Path unavailable</Text><Text className="mt-1 text-xs" style={{ color: colors.secondaryText }}>{plan.criticalPath.reason}</Text></View>;
  const hours = Math.round(((plan.criticalPath.durationMinutes ?? 0) / 60) * 10) / 10;
  return <Pressable onPress={onFocus} className="mb-3 rounded-2xl border p-3" style={{ borderColor: highlighted ? colors.error : colors.border }}><View className="flex-row items-center justify-between"><Text className="text-sm font-black" style={{ color: colors.text }}>Critical Path</Text><Text className="text-xs font-bold" style={{ color: colors.error }}>{plan.criticalPath.itemIds.length} items</Text></View><Text className="mt-1 text-xs" style={{ color: colors.secondaryText }}>{hours} hours remaining · Highlight Critical Path to {highlighted ? 'show the full plan' : 'focus affected items'}.</Text></Pressable>;
}

type Colors = ReturnType<typeof useTheme>['theme']['colors'];

function forecastDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
}

/**
 * Plan Summary — the resource-aware forecast at a glance. Critical Path answers
 * "what delays the project?"; this answers "when will it actually finish, given
 * who does the work and when they're free?". Read-only: never mutates saved dates.
 */
function ForecastSummary({ plan, colors }: { plan: ProjectPlan; colors: Colors }) {
  const f = plan.forecast;
  const cp = plan.criticalPath;
  const statusLabel = f.status === 'available' ? 'On track' : f.status === 'partial' ? 'Partial' : 'Unavailable';
  const statusColor = f.status === 'available' ? colors.success : f.status === 'partial' ? colors.warning : colors.error;
  return (
    <View className="mb-3 rounded-2xl border p-3" style={{ borderColor: statusColor, backgroundColor: colors.surfaceElevated }}>
      <View className="mb-2 flex-row items-center justify-between">
        <Text className="text-sm font-black" style={{ color: colors.text }}>Resource Forecast</Text>
        <Text className="text-[10px] font-black uppercase" style={{ color: statusColor }}>{statusLabel}</Text>
      </View>
      <View className="flex-row flex-wrap">
        <SummaryField label="CPM completion" value={cp.status === 'available' ? forecastDate(cp.projectedCompletion) : 'N/A'} colors={colors} />
        <SummaryField label="Forecast completion" value={forecastDate(f.projectedCompletion)} colors={colors} />
        <SummaryField label="Deadline" value={forecastDate(f.deadline)} colors={colors} />
        <SummaryField label="Delay" value={f.delayMinutes > 0 ? `${f.delayDays}d late` : 'On time'} danger={f.delayMinutes > 0} colors={colors} />
        <SummaryField label="Capacity shortfall" value={f.capacityShortfallMinutes > 0 ? formatMinutesLabel(f.capacityShortfallMinutes) : 'None'} danger={f.capacityShortfallMinutes > 0} colors={colors} />
        <SummaryField label="Unscheduled" value={String(f.unscheduledItemIds.length)} danger={f.unscheduledItemIds.length > 0} colors={colors} />
        <SummaryField label="Main bottleneck" value={f.bottleneckAssignee ? f.bottleneckAssignee.assigneeName : 'None'} danger={Boolean(f.bottleneckAssignee)} colors={colors} />
      </View>
      {f.reasons.map((reason, i) => (
        <Text key={i} className="mt-1 text-xs" style={{ color: colors.secondaryText }}>• {reason}</Text>
      ))}
      {f.fallbackPolicy ? <Text className="mt-2 text-[11px]" style={{ color: colors.textSubtle }}>{f.fallbackPolicy}</Text> : null}
    </View>
  );
}

function SummaryField({ label, value, danger, colors }: { label: string; value: string; danger?: boolean; colors: Colors }) {
  return (
    <View className="mb-2 w-1/2 pr-2">
      <Text className="text-[10px] font-black uppercase" style={{ color: colors.secondaryText }}>{label}</Text>
      <Text className="text-sm font-bold" style={{ color: danger ? colors.error : colors.text }}>{value}</Text>
    </View>
  );
}

/** Per-member capacity vs. scheduled load (all computed on the backend). */
function ResourceLanesPanel({ lanes, colors }: { lanes: ResourceLane[]; colors: Colors }) {
  if (!lanes.length) return null;
  return (
    <View className="mb-3 rounded-2xl border p-3" style={{ borderColor: colors.border }}>
      <Text className="mb-2 text-xs font-black uppercase tracking-wide" style={{ color: colors.secondaryText }}>Team capacity</Text>
      {lanes.map((lane) => {
        const over = lane.overloadMinutes > 0;
        const fill = Math.min(100, lane.utilisationPercent);
        return (
          <View key={lane.assigneeId} className="mb-2">
            <View className="mb-0.5 flex-row items-center justify-between">
              <Text className="text-xs font-bold" style={{ color: colors.text }}>{lane.assigneeName}</Text>
              <Text className="text-xs font-bold" style={{ color: over ? colors.error : colors.secondaryText }}>
                {lane.utilisationPercent}%{over ? ` · +${formatMinutesLabel(lane.overloadMinutes)}` : ''}
              </Text>
            </View>
            <View className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: colors.progressTrack }}>
              <View className="h-2 rounded-full" style={{ width: `${fill}%`, backgroundColor: over ? colors.error : colors.accent }} />
            </View>
            <Text className="mt-0.5 text-[10px]" style={{ color: colors.textSubtle }}>
              {formatMinutesLabel(lane.scheduledMinutes)} of {formatMinutesLabel(lane.availableMinutes)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function WarningBanner({ warnings, colors }: { warnings: ProjectPlanWarning[]; colors: Colors }) {
  if (!warnings.length) return null;
  return (
    <View className="mb-3 rounded-2xl border p-3" style={{ borderColor: colors.error, backgroundColor: colors.surfaceElevated }}>
      <Text className="text-xs font-black uppercase tracking-wide" style={{ color: colors.error }}>
        Invalid dependency data
      </Text>
      {warnings.map((warning, i) => (
        <Text key={`${warning.code}-${i}`} className="mt-1 text-sm" style={{ color: colors.text }}>
          {warning.message}
        </Text>
      ))}
    </View>
  );
}

function ChipRow({
  label,
  options,
  activeId,
  onSelect,
  colors,
}: {
  label: string;
  options: { id: string | null; label: string }[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
  colors: Colors;
}) {
  return (
    <View className="mb-2">
      <Text className="mb-1 text-[10px] font-black uppercase tracking-wide" style={{ color: colors.secondaryText }}>
        {label}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row gap-1.5">
          {options.map((option) => {
            const active = option.id === activeId;
            return (
              <Pressable
                key={option.id ?? 'all'}
                onPress={() => onSelect(option.id)}
                className="rounded-full px-3 py-1"
                style={{ backgroundColor: active ? colors.accent : colors.surfaceElevated }}
              >
                <Text className="text-xs font-bold" style={{ color: active ? colors.accentText : colors.secondaryText }}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}
