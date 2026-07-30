import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { EmptyState, SectionCard } from '../../../../components/layout';
import { useTheme } from '../../../../theme/useTheme';
import {
  useProjectHealthQuery,
  type HealthStatus,
  type MetricHealth,
  type ProjectHealthReport,
} from '../../api/ai-collaboration.api';

type Colors = ReturnType<typeof useTheme>['theme']['colors'];
type Props = { taskId: string; onNavigate?: (tab: 'plan' | 'team' | 'health') => void };

const STATUS_META: Record<HealthStatus, { label: string; icon: string }> = {
  healthy: { label: 'Healthy', icon: '✓' },
  balanced: { label: 'Balanced', icon: '≈' },
  warning: { label: 'Warning', icon: '▲' },
  at_risk: { label: 'At risk', icon: '⚠' },
  critical: { label: 'Critical', icon: '✕' },
  no_data: { label: 'No data', icon: '–' },
};

function statusColor(status: HealthStatus, colors: Colors): string {
  if (status === 'healthy') return colors.success;
  if (status === 'balanced') return colors.accent;
  if (status === 'warning') return colors.warning;
  if (status === 'no_data') return colors.textSubtle;
  return colors.error;
}

const METRICS: { key: keyof Pick<ProjectHealthReport, 'schedule' | 'capacity' | 'dependency' | 'execution' | 'focus' | 'collaboration'>; label: string }[] = [
  { key: 'schedule', label: 'Schedule' },
  { key: 'capacity', label: 'Capacity' },
  { key: 'dependency', label: 'Dependency' },
  { key: 'execution', label: 'Execution' },
  { key: 'focus', label: 'Focus' },
  { key: 'collaboration', label: 'Collaboration' },
];

/**
 * Project Health dashboard (mobile, read-only). Every score/status/reason/
 * contributor/warning comes from GET /ai/collaboration/health, which blends the
 * Critical Path, Resource Forecast, Resource Lanes, Team Intelligence and Focus
 * data deterministically. The client renders only — no health formulas here.
 */
export function ProjectHealthPanel({ taskId, onNavigate }: Props) {
  const { theme: { colors } } = useTheme();
  const query = useProjectHealthQuery(taskId);

  if (query.isLoading)
    return (
      <SectionCard>
        <Text accessibilityLiveRegion="polite" style={{ color: colors.secondaryText }}>Loading Project Health…</Text>
      </SectionCard>
    );
  if (query.isError)
    return (
      <SectionCard>
        <Text style={{ color: colors.error }}>
          {(query.error as Error & { status?: number }).status === 403
            ? 'You do not have permission to view Project Health.'
            : 'Could not load Project Health.'}
        </Text>
      </SectionCard>
    );
  const data = query.data;
  if (!data) return <EmptyState icon="🩺" title="No health data yet" description="Add work and assignees to see project health." />;

  return (
    <View>
      <OverallHealth overall={data.overall} colors={colors} />
      {METRICS.map((metric) => (
        <MetricCard key={metric.key} label={metric.label} metric={data[metric.key]} colors={colors} />
      ))}
      <Contributors contributors={data.contributors} colors={colors} />
      <Warnings warnings={data.warnings} onNavigate={onNavigate} colors={colors} />
      <Trend trend={data.trend} colors={colors} />
      <Text className="mt-1 text-[11px]" style={{ color: colors.textSubtle }}>
        Read-only. Server-computed from the resource-aware forecast, critical path, team capacity, and focus history.
      </Text>
    </View>
  );
}

function OverallHealth({ overall, colors }: { overall: MetricHealth; colors: Colors }) {
  const meta = STATUS_META[overall.status];
  const score = overall.score ?? 0;
  const color = statusColor(overall.status, colors);
  return (
    <SectionCard className="mb-3">
      <View className="flex-row items-center gap-4">
        <View
          className="h-20 w-20 items-center justify-center rounded-full border-4"
          style={{ borderColor: colors.border }}
          accessibilityRole="image"
          accessibilityLabel={`Project health ${score} percent, ${meta.label}`}
        >
          <Text className="text-xl font-black" style={{ color }}>{score}%</Text>
        </View>
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text className="text-[10px] font-black uppercase" style={{ color: colors.secondaryText }}>Project health</Text>
            <Text className="text-xs font-black" style={{ color }}>{meta.icon} {meta.label}</Text>
          </View>
          <Text className="mt-1 text-sm" style={{ color: colors.text }}>{overall.reason}</Text>
          <View className="mt-2 h-2 rounded-full" style={{ backgroundColor: colors.progressTrack }} accessibilityRole="progressbar" accessibilityValue={{ now: score, min: 0, max: 100 }}>
            <View className="h-2 rounded-full" style={{ width: `${score}%`, backgroundColor: color }} />
          </View>
        </View>
      </View>
    </SectionCard>
  );
}

function MetricCard({ label, metric, colors }: { label: string; metric: MetricHealth; colors: Colors }) {
  const [open, setOpen] = useState(false);
  const meta = STATUS_META[metric.status];
  const score = metric.score;
  const color = statusColor(metric.status, colors);
  const details = Object.entries(metric.details);
  return (
    <SectionCard className="mb-2">
      <Pressable
        onPress={() => details.length && setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${label} health ${score == null ? 'no data' : `${score} percent`}, ${meta.label}. ${open ? 'Collapse' : 'Expand'}.`}
      >
        <View className="flex-row items-center justify-between">
          <Text className="text-sm font-black" style={{ color: colors.text }}>{label} health</Text>
          <Text className="text-xs font-black" style={{ color }}>{meta.icon} {score == null ? '—' : `${score}%`}</Text>
        </View>
        <View className="mt-1.5 h-1.5 rounded-full" style={{ backgroundColor: colors.progressTrack }}>
          <View className="h-1.5 rounded-full" style={{ width: `${score ?? 0}%`, backgroundColor: color }} />
        </View>
        <Text className="mt-1 text-xs" style={{ color: colors.secondaryText }}>{metric.reason}</Text>
      </Pressable>
      {open ? (
        <View className="mt-2 border-t pt-2" style={{ borderColor: colors.border }}>
          {details.map(([key, value]) => (
            <View key={key} className="mb-1 flex-row items-center justify-between">
              <Text className="text-[11px]" style={{ color: colors.secondaryText }}>{humanize(key)}</Text>
              <Text className="text-[11px] font-bold" style={{ color: colors.text }}>{formatValue(value)}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </SectionCard>
  );
}

function Contributors({ contributors, colors }: { contributors: ProjectHealthReport['contributors']; colors: Colors }) {
  if (!contributors.positive.length && !contributors.negative.length) return null;
  return (
    <SectionCard className="mb-2">
      <Text className="mb-1 text-[10px] font-black uppercase" style={{ color: colors.success }}>Helping</Text>
      {contributors.positive.length ? (
        contributors.positive.map((c, i) => (
          <Text key={i} className="text-sm" style={{ color: colors.text }}>✓ {c.text}</Text>
        ))
      ) : (
        <Text className="text-xs" style={{ color: colors.secondaryText }}>Nothing notable.</Text>
      )}
      <Text className="mb-1 mt-2 text-[10px] font-black uppercase" style={{ color: colors.error }}>Hurting</Text>
      {contributors.negative.length ? (
        contributors.negative.map((c, i) => (
          <Text key={i} className="text-sm" style={{ color: colors.text }}>⚠ {c.text}</Text>
        ))
      ) : (
        <Text className="text-xs" style={{ color: colors.secondaryText }}>Nothing hurting the project.</Text>
      )}
    </SectionCard>
  );
}

function Warnings({ warnings, onNavigate, colors }: { warnings: ProjectHealthReport['warnings']; onNavigate?: Props['onNavigate']; colors: Colors }) {
  if (!warnings.length) return null;
  const groups = [...new Set(warnings.map((w) => w.group))];
  return (
    <SectionCard className="mb-2">
      <Text className="mb-2 text-[10px] font-black uppercase tracking-wide" style={{ color: colors.secondaryText }}>Warnings</Text>
      {groups.map((group) => (
        <View key={group} className="mb-2">
          <Text className="text-[11px] font-black uppercase" style={{ color: colors.secondaryText }}>{group}</Text>
          {warnings.filter((w) => w.group === group).map((w, i) => (
            <View key={i} className="mt-1 flex-row items-center justify-between gap-2">
              <Text className="flex-1 text-sm" style={{ color: w.severity === 'critical' ? colors.error : colors.warning }}>
                {w.severity === 'critical' ? '✕ ' : '⚠ '}{w.message}
              </Text>
              {onNavigate && w.link !== 'health' ? (
                <Pressable onPress={() => onNavigate(w.link)} accessibilityRole="button" className="rounded-full px-2 py-0.5" style={{ backgroundColor: colors.surfaceElevated }}>
                  <Text className="text-[11px] font-bold" style={{ color: colors.text }}>Open {w.link === 'plan' ? 'Plan' : 'Team'}</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      ))}
    </SectionCard>
  );
}

function Trend({ trend, colors }: { trend: ProjectHealthReport['trend']; colors: Colors }) {
  return (
    <SectionCard className="mb-2">
      <Text className="text-[10px] font-black uppercase tracking-wide" style={{ color: colors.secondaryText }}>Health trend</Text>
      {trend.available && trend.points.length ? (
        <View className="mt-2 flex-row gap-4">
          {trend.points.map((point, i) => (
            <View key={i} className="items-center">
              <Text className="text-sm font-black" style={{ color: colors.text }}>{point.score}%</Text>
              <Text className="text-[10px]" style={{ color: colors.secondaryText }}>{point.label}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text className="mt-1 text-sm" style={{ color: colors.secondaryText }}>{trend.reason ?? 'Trend unavailable'}</Text>
      )}
    </SectionCard>
  );
}

function humanize(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim();
}

function formatValue(value: number | string | boolean | null): string {
  if (value === null) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}
