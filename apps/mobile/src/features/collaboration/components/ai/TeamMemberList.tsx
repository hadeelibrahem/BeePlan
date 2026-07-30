import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { EmptyState, SectionCard } from '../../../../components/layout';
import { useTheme } from '../../../../theme/useTheme';
import {
  useTeamInsightsQuery,
  type TeamHealth,
  type TeamInsightsMember,
  type TeamInsightsSummary,
  type PlanFocus,
  type TeamMemberStatus,
} from '../../api/ai-collaboration.api';

type Colors = ReturnType<typeof useTheme>['theme']['colors'];

const fmt = (value: number) => (value >= 60 ? `${Math.floor(value / 60)}h${value % 60 ? ` ${value % 60}m` : ''}` : `${value}m`);
const fmtDate = (value: string | null) => {
  if (!value) return 'Unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unavailable' : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
};

const STATUS_META: Record<TeamMemberStatus, { label: string; icon: string }> = {
  available: { label: 'Available', icon: '○' },
  balanced: { label: 'Balanced', icon: '◐' },
  heavy: { label: 'Heavy', icon: '◕' },
  over_capacity: { label: 'Over capacity', icon: '●' },
};
const CAPACITY_LABEL: Record<TeamMemberStatus, string> = {
  available: 'Under utilised',
  balanced: 'Balanced',
  heavy: 'Near capacity',
  over_capacity: 'Over capacity',
};
const HEALTH_META: Record<TeamHealth, { label: string; icon: string }> = {
  healthy: { label: 'Healthy', icon: '✓' },
  balanced: { label: 'Balanced', icon: '≈' },
  strained: { label: 'Strained', icon: '▲' },
  at_risk: { label: 'At risk', icon: '⚠' },
};

function statusColor(status: TeamMemberStatus, colors: Colors): string {
  if (status === 'over_capacity') return colors.error;
  if (status === 'heavy') return colors.warning;
  if (status === 'available') return colors.success;
  return colors.accent;
}
function healthColor(health: TeamHealth, colors: Colors): string {
  if (health === 'at_risk') return colors.error;
  if (health === 'strained') return colors.warning;
  if (health === 'healthy') return colors.success;
  return colors.accent;
}

type QuickFilter = 'critical' | 'blocked' | 'overloaded' | 'available';
type Filters = {
  role: 'all' | TeamInsightsMember['role'];
  status: 'all' | TeamMemberStatus;
  quick: QuickFilter | null;
  /** Set by a deep link to scope the list to one member. */
  memberId: string | null;
};
const EMPTY: Filters = { role: 'all', status: 'all', quick: null, memberId: null };

function memberMatches(member: TeamInsightsMember, filters: Filters): boolean {
  if (filters.memberId && member.userId !== filters.memberId) return false;
  if (filters.role !== 'all' && member.role !== filters.role) return false;
  if (filters.status !== 'all' && member.status !== filters.status) return false;
  if (filters.quick === 'critical' && member.criticalItemCount === 0) return false;
  if (filters.quick === 'blocked' && member.blockedItemCount === 0) return false;
  if (filters.quick === 'overloaded' && member.status !== 'over_capacity') return false;
  if (filters.quick === 'available' && member.status !== 'available') return false;
  return true;
}

type MetricKey = 'remaining' | 'available' | 'utilisation' | 'completed' | 'critical' | 'blocked';
const METRICS: { key: MetricKey; label: string; value: (m: TeamInsightsMember) => number; fmt: (n: number) => string }[] = [
  { key: 'utilisation', label: 'Utilisation', value: (m) => m.utilisationPercent, fmt: (n) => `${n}%` },
  { key: 'remaining', label: 'Remaining', value: (m) => m.remainingMinutes, fmt },
  { key: 'available', label: 'Capacity', value: (m) => m.availableMinutes, fmt },
  { key: 'completed', label: 'Completed', value: (m) => m.completedMinutes, fmt },
  { key: 'critical', label: 'Critical', value: (m) => m.criticalItemCount, fmt: (n) => `${n}` },
  { key: 'blocked', label: 'Blocked', value: (m) => m.blockedItemCount, fmt: (n) => `${n}` },
];

/**
 * Team Intelligence dashboard (mobile, read-only). All workload/capacity/forecast
 * figures come from GET /ai/collaboration/team, which reuses the shared project
 * plan (Critical Path + Resource Forecast + Resource Lanes). The client renders
 * and filters only — no calculations here.
 */
export function TeamMemberList({ taskId, initialFocus }: { taskId: string; initialFocus?: PlanFocus }) {
  const { theme: { colors } } = useTheme();
  const query = useTeamInsightsQuery(taskId);
  const [filters, setFilters] = useState<Filters>(() => ({ ...EMPTY, memberId: initialFocus?.memberId ?? null }));
  const [metric, setMetric] = useState<MetricKey>('utilisation');

  // Re-apply when a deep link arrives while this tab is already mounted.
  const focusMemberId = initialFocus?.memberId ?? null;
  useEffect(() => {
    if (focusMemberId) setFilters({ ...EMPTY, memberId: focusMemberId });
  }, [focusMemberId]);

  const members = query.data?.members ?? [];
  const visible = useMemo(() => members.filter((member) => memberMatches(member, filters)), [members, filters]);

  if (query.isLoading)
    return (
      <SectionCard>
        <Text accessibilityLiveRegion="polite" style={{ color: colors.secondaryText }}>
          Loading Team Intelligence…
        </Text>
      </SectionCard>
    );
  if (query.isError)
    return (
      <SectionCard>
        <Text style={{ color: colors.error }}>
          {(query.error as Error & { status?: number }).status === 403
            ? 'You do not have permission to view Team Intelligence.'
            : 'Could not load Team Intelligence.'}
        </Text>
      </SectionCard>
    );
  const data = query.data;
  if (!data?.members.length)
    return <EmptyState icon="👥" title="No team members yet" description="Invite collaborators to see workload intelligence." />;

  return (
    <View>
      <TeamSummary summary={data.summary} colors={colors} />
      <FilterBar filters={filters} onChange={setFilters} colors={colors} members={members} />
      <WorkloadComparison members={visible} metric={metric} onMetric={setMetric} colors={colors} />
      {visible.length ? (
        visible.map((member) => <MemberCard key={member.userId} member={member} projectDelay={data.summary.forecastDelay.minutes} colors={colors} />)
      ) : (
        <Text className="mb-2 text-sm" style={{ color: colors.secondaryText }}>No members match these filters.</Text>
      )}
      {data.warnings.map((warning) => (
        <Text key={warning} accessibilityLiveRegion="polite" className="mb-1 text-xs" style={{ color: colors.warning }}>
          {warning}
        </Text>
      ))}
      <Text className="mt-1 text-[11px]" style={{ color: colors.textSubtle }}>
        {data.viewerRole === 'owner' ? 'Full Team Intelligence.' : 'Read-only Team Intelligence.'} All figures are server-computed from the
        resource-aware forecast. Redistribution arrives later.
      </Text>
    </View>
  );
}

// --- Section 1: Team Summary -------------------------------------------------

function TeamSummary({ summary, colors }: { summary: TeamInsightsSummary; colors: Colors }) {
  const health = HEALTH_META[summary.health];
  const delay = summary.forecastDelay;
  return (
    <SectionCard className="mb-3">
      <View className="mb-2 flex-row items-center justify-between">
        <Text className="text-sm font-black" style={{ color: colors.text }}>Team health</Text>
        <Text className="text-xs font-black" style={{ color: healthColor(summary.health, colors) }} accessibilityLabel={`Team health ${health.label}`}>
          {health.icon} {health.label}
        </Text>
      </View>
      <View className="flex-row flex-wrap">
        <Stat label="Balance" value={`${summary.balancePercent}%`} colors={colors} />
        <Stat label="Remaining" value={fmt(summary.remainingMinutes)} colors={colors} />
        <Stat label="Capacity" value={fmt(summary.availableMinutes)} colors={colors} />
        <Stat label="Shortfall" value={summary.capacityShortfallMinutes > 0 ? fmt(summary.capacityShortfallMinutes) : 'None'} danger={summary.capacityShortfallMinutes > 0} colors={colors} />
        <Stat label="Overloaded" value={String(summary.overloadedCount)} danger={summary.overloadedCount > 0} colors={colors} />
        <Stat label="Available" value={String(summary.availableCount)} colors={colors} />
        <Stat label="Blocked critical" value={String(summary.blockedCriticalCount)} danger={summary.blockedCriticalCount > 0} colors={colors} />
        <Stat label="Forecast done" value={fmtDate(summary.forecastCompletion)} colors={colors} />
        <Stat label="Delay" value={delay.minutes > 0 ? `${delay.days}d` : 'On time'} danger={delay.minutes > 0} colors={colors} />
      </View>
    </SectionCard>
  );
}

function Stat({ label, value, danger, colors }: { label: string; value: string; danger?: boolean; colors: Colors }) {
  return (
    <View className="mb-2 w-1/3 pr-2">
      <Text className="text-[10px] font-black uppercase" style={{ color: colors.secondaryText }}>{label}</Text>
      <Text className="text-sm font-black" style={{ color: danger ? colors.error : colors.text }}>{value}</Text>
    </View>
  );
}

// --- Section 7: Filters ------------------------------------------------------

function FilterBar({
  filters,
  onChange,
  colors,
  members,
}: {
  filters: Filters;
  onChange: (next: Filters) => void;
  colors: Colors;
  members: TeamInsightsMember[];
}) {
  const focusedName = filters.memberId
    ? members.find((member) => member.userId === filters.memberId)?.name
    : null;
  const quicks: { key: QuickFilter; label: string }[] = [
    { key: 'critical', label: 'Critical' },
    { key: 'blocked', label: 'Blocked' },
    { key: 'overloaded', label: 'Overloaded' },
    { key: 'available', label: 'Available' },
  ];
  const statuses = Object.keys(STATUS_META) as TeamMemberStatus[];
  return (
    <View className="mb-3">
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row gap-1.5">
          <Chip label="All" active={filters.quick === null && filters.role === 'all' && filters.status === 'all'} onPress={() => onChange(EMPTY)} colors={colors} />
          {quicks.map((quick) => (
            <Chip key={quick.key} label={quick.label} active={filters.quick === quick.key} onPress={() => onChange({ ...filters, quick: filters.quick === quick.key ? null : quick.key })} colors={colors} />
          ))}
          {statuses.map((status) => (
            <Chip key={status} label={STATUS_META[status].label} active={filters.status === status} onPress={() => onChange({ ...filters, status: filters.status === status ? 'all' : status })} colors={colors} />
          ))}
        </View>
      </ScrollView>
      {filters.memberId ? (
        <Pressable
          onPress={() => onChange({ ...filters, memberId: null })}
          accessibilityRole="button"
          accessibilityLabel="Show the whole team again"
          className="mt-2 self-start rounded-full px-3 py-1"
          style={{ backgroundColor: `${colors.accent}26` }}
        >
          <Text className="text-xs font-bold" style={{ color: colors.accentInk }}>
            Showing {focusedName ?? 'one member'} only ×
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Chip({ label, active, onPress, colors }: { label: string; active: boolean; onPress: () => void; colors: Colors }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className="rounded-full px-3 py-1"
      style={{ backgroundColor: active ? colors.accent : colors.surfaceElevated }}
    >
      <Text className="text-xs font-bold" style={{ color: active ? colors.accentText : colors.secondaryText }}>{label}</Text>
    </Pressable>
  );
}

// --- Section 3: Workload Comparison -----------------------------------------

function WorkloadComparison({ members, metric, onMetric, colors }: { members: TeamInsightsMember[]; metric: MetricKey; onMetric: (key: MetricKey) => void; colors: Colors }) {
  const active = METRICS.find((m) => m.key === metric)!;
  const rows = members.map((member) => ({ member, value: active.value(member) }));
  const max = Math.max(1, ...rows.map((row) => row.value));
  if (!rows.length) return null;
  return (
    <SectionCard className="mb-3">
      <Text className="mb-2 text-sm font-black" style={{ color: colors.text }}>Workload comparison</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-2">
        <View className="flex-row gap-1.5">
          {METRICS.map((m) => (
            <Chip key={m.key} label={m.label} active={m.key === metric} onPress={() => onMetric(m.key)} colors={colors} />
          ))}
        </View>
      </ScrollView>
      {rows.map(({ member, value }) => {
        const pct = Math.max(2, Math.round((value / max) * 100));
        const barColor = metric === 'utilisation' ? statusColor(member.status, colors) : member.isBottleneck ? colors.error : colors.accent;
        return (
          <View key={member.userId} className="mb-1.5 flex-row items-center gap-2">
            <Text className="text-xs font-semibold" style={{ color: colors.text, width: 84 }} numberOfLines={1}>
              {member.isBottleneck ? '⭐ ' : ''}{member.name}
            </Text>
            <View className="h-3 flex-1 overflow-hidden rounded-full" style={{ backgroundColor: colors.progressTrack }} accessibilityLabel={`${member.name}: ${active.fmt(value)}`}>
              <View className="h-3 rounded-full" style={{ width: `${pct}%`, backgroundColor: barColor }} />
            </View>
            <Text className="text-xs font-bold" style={{ color: colors.secondaryText, width: 52, textAlign: 'right' }}>{active.fmt(value)}</Text>
          </View>
        );
      })}
    </SectionCard>
  );
}

// --- Section 2/4/5/6: Member card (expandable) -------------------------------

function MemberCard({ member, projectDelay, colors }: { member: TeamInsightsMember; projectDelay: number; colors: Colors }) {
  const [open, setOpen] = useState(false);
  const status = STATUS_META[member.status];
  const width = Math.min(100, member.utilisationPercent);
  return (
    <SectionCard className="mb-2" style={member.isBottleneck ? { borderColor: colors.error, borderWidth: 1 } : undefined}>
      <Pressable
        onPress={() => setOpen((value) => !value)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${member.name}, ${member.role}, ${status.label}, ${member.utilisationPercent}% utilisation. ${open ? 'Collapse' : 'Expand'} details.`}
      >
        <View className="flex-row items-center justify-between">
          <View className="flex-1 pr-2">
            <Text className="text-sm font-black" style={{ color: colors.text }} numberOfLines={1}>
              {member.isBottleneck ? '⭐ ' : ''}{member.name}
            </Text>
            <Text className="text-xs" style={{ color: colors.secondaryText }}>{member.role}</Text>
          </View>
          <Text className="text-xs font-black" style={{ color: statusColor(member.status, colors) }}>
            {status.icon} {status.label}
          </Text>
        </View>
        <View className="mt-2 h-2 rounded-full" style={{ backgroundColor: colors.progressTrack }} accessibilityRole="progressbar" accessibilityValue={{ now: member.utilisationPercent, min: 0, max: 100 }}>
          <View className="h-2 rounded-full" style={{ width: `${width}%`, backgroundColor: statusColor(member.status, colors) }} />
        </View>
        <Text className="mt-1 text-xs" style={{ color: colors.secondaryText }}>
          {member.utilisationPercent}% · {fmt(member.remainingMinutes)} of {fmt(member.availableMinutes)} · {CAPACITY_LABEL[member.status]}
        </Text>
      </Pressable>

      {member.isBottleneck ? (
        <Text className="mt-2 rounded-lg px-2 py-1 text-xs font-black" style={{ color: colors.error, backgroundColor: colors.surfaceElevated }}>
          ⭐ Project bottleneck
        </Text>
      ) : null}

      {open ? (
        <View className="mt-2 border-t pt-2" style={{ borderColor: colors.border }}>
          <Group title="Workload" colors={colors}>
            <Cell label="Remaining" value={fmt(member.remainingMinutes)} colors={colors} />
            <Cell label="Capacity" value={fmt(member.availableMinutes)} colors={colors} />
            <Cell label="Overload" value={member.overloadMinutes > 0 ? fmt(member.overloadMinutes) : 'None'} colors={colors} />
            <Cell label="Focus time" value={fmt(member.actualMinutes)} colors={colors} />
            <Cell label="Completed" value={fmt(member.completedMinutes)} colors={colors} />
            <Cell label="Assigned" value={String(member.assignedItemCount)} colors={colors} />
          </Group>
          <Group title="Assignment readiness" colors={colors}>
            <Cell label="Ready" value={String(member.readyItemCount)} colors={colors} />
            <Cell label="Blocked" value={String(member.blockedItemCount)} colors={colors} />
            <Cell label="Critical" value={String(member.criticalItemCount)} colors={colors} />
            <Cell label="Future" value={String(member.futureItemCount)} colors={colors} />
            <Cell label="Completed" value={String(member.completedItemCount)} colors={colors} />
            <Cell label="Unscheduled" value={String(member.unscheduledItemCount)} colors={colors} />
          </Group>
          <Group title="Capacity analysis" colors={colors}>
            <Cell label="Current" value={fmt(member.availableMinutes)} colors={colors} />
            <Cell label="Remaining" value={fmt(Math.max(0, member.availableMinutes - member.remainingMinutes))} colors={colors} />
            <Cell label="Overload" value={member.overloadMinutes > 0 ? fmt(member.overloadMinutes) : 'None'} colors={colors} />
            <Cell label="Status" value={CAPACITY_LABEL[member.status]} colors={colors} />
          </Group>
          <Group title="Forecast impact" colors={colors}>
            <Cell label="Delay contribution" value={member.forecastDelayMinutes > 0 ? fmt(member.forecastDelayMinutes) : 'None'} colors={colors} />
            <Cell label="Critical items" value={String(member.criticalItemCount)} colors={colors} />
            <Cell label="Bottleneck" value={member.isBottleneck ? 'Yes' : 'No'} colors={colors} />
            <Cell label="Project delay" value={projectDelay > 0 ? fmt(projectDelay) : 'On time'} colors={colors} />
          </Group>
        </View>
      ) : null}
    </SectionCard>
  );
}

function Group({ title, children, colors }: { title: string; children: React.ReactNode; colors: Colors }) {
  return (
    <View className="mb-2">
      <Text className="mb-1 text-[10px] font-black uppercase tracking-wide" style={{ color: colors.secondaryText }}>{title}</Text>
      <View className="flex-row flex-wrap">{children}</View>
    </View>
  );
}

function Cell({ label, value, colors }: { label: string; value: string; colors: Colors }) {
  return (
    <View className="mb-1 w-1/2 flex-row items-center justify-between pr-3">
      <Text className="text-[11px]" style={{ color: colors.secondaryText }}>{label}</Text>
      <Text className="text-xs font-bold" style={{ color: colors.text }}>{value}</Text>
    </View>
  );
}
