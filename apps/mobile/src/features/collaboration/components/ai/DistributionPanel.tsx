import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { OutlineButton, PrimaryButton, SecondaryButton, SectionCard } from '../../../../components/layout';
import { useTheme } from '../../../../theme/useTheme';
import type { ApiTask } from '../../../../lib/tasksApi';
import {
  useApplyCollaborationPlanMutation,
  useGenerateCollaborationPlanMutation,
} from '../../api/ai-collaboration.api';
import type {
  ApplyPlanItemInput,
  CollaborationPlanItem,
  CollaborationPlanPreferencesInput,
} from '../../api/ai-collaboration-planner.api';
import { getMembers } from '../../api/collaboration.api';
import { friendlyError } from '../../errorMessages';
import type { TaskMember } from '../../types';
import { CapacityOverview } from './CapacityOverview';

type Props = {
  task: ApiTask;
};

// Sensible fixed defaults for v1 — full preference tuning lived in the old
// modal; here the emphasis is staying with the task, not one-time setup.
const DEFAULT_PREFERENCES: CollaborationPlanPreferencesInput = {
  workloadDistribution: 'equal',
  taskType: 'auto',
  // The owner isn't a selectable candidate (selectedMemberIds accepts
  // editors only — see the getMembers filter below), but should still get a
  // fair share of the split, same as web's DistributionPanel.
  includeOwner: true,
  allowParallelWork: true,
  addReviewSteps: false,
  addBufferTime: true,
  taskGranularity: 'medium',
};

function toApplyInput(item: CollaborationPlanItem): ApplyPlanItemInput {
  return {
    proposalId: item.proposalId,
    title: item.title,
    description: item.description || undefined,
    assigneeUserId: item.assigneeUserId,
    estimatedDurationMinutes: item.estimatedDurationMinutes,
    suggestedStart: item.suggestedStart ?? undefined,
    suggestedDue: item.suggestedDue ?? undefined,
    priority: item.priority,
    order: item.order,
    dependsOnProposalIds: item.dependsOnProposalIds,
    canRunInParallel: item.canRunInParallel,
    activityType: item.activityType,
    sharedSessionId: item.sharedSessionId,
  };
}

function formatMinutes(minutes: number) {
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours}h ${rest}m` : `${hours}h`;
  }
  return `${minutes}m`;
}

/**
 * Capacity-aware "smart fair split" stage: shows current capacity, lets the
 * owner generate an AI proposal for who should do what, and requires an
 * explicit Accept before anything becomes a real subtask.
 */
export function DistributionPanel({ task }: Props) {
  const { theme } = useTheme();
  const { colors } = theme;

  const [members, setMembers] = useState<TaskMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [showMemberPicker, setShowMemberPicker] = useState(true);
  const [planExpanded, setPlanExpanded] = useState(false);
  const [appliedNotice, setAppliedNotice] = useState('');

  const generateMutation = useGenerateCollaborationPlanMutation(task.id);
  const applyMutation = useApplyCollaborationPlanMutation(task.id);

  useEffect(() => {
    let active = true;
    setLoadingMembers(true);
    getMembers(task.id)
      .then((rows) => {
        if (!active) return;
        setMembers(rows);
        setSelectedMemberIds((current) =>
          current.length
            ? current
            : rows.filter((m) => m.status === 'accepted' && m.role === 'editor').map((m) => m.userId),
        );
      })
      .catch(() => {
        if (active) setMembers([]);
      })
      .finally(() => {
        if (active) setLoadingMembers(false);
      });
    return () => {
      active = false;
    };
  }, [task.id]);

  const eligibleEditors = useMemo(
    () => members.filter((m) => m.status === 'accepted' && m.role === 'editor'),
    [members],
  );

  function toggleMember(userId: string) {
    setSelectedMemberIds((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
  }

  function runGenerate() {
    if (!selectedMemberIds.length) return;
    setAppliedNotice('');
    generateMutation.mutate(
      { selectedMemberIds, preferences: DEFAULT_PREFERENCES },
      {
        onSuccess: () => {
          setShowMemberPicker(false);
          setPlanExpanded(false);
        },
      },
    );
  }

  function runApply() {
    const proposal = generateMutation.data;
    if (!proposal) return;
    setAppliedNotice('');
    applyMutation.mutate(
      { planId: proposal.planId, items: proposal.items.map(toApplyInput) },
      {
        onSuccess: (result) => {
          if (result.created.subtaskIds.length > 0) {
            setAppliedNotice('Plan accepted — subtasks were created for your team.');
            generateMutation.reset();
          }
        },
      },
    );
  }

  const proposal = generateMutation.data;
  const maxMinutes = proposal ? Math.max(1, ...proposal.workloadByMember.map((m) => m.totalEstimatedMinutes)) : 1;

  return (
    <View>
      <CapacityOverview taskId={task.id} />

      {showMemberPicker || !proposal ? (
        <SectionCard className="mb-3">
          <Text className="mb-2 text-xs font-black uppercase tracking-wide" style={{ color: colors.secondaryText }}>
            Who should this plan cover?
          </Text>

          {loadingMembers ? (
            <Text className="text-sm" style={{ color: colors.secondaryText }}>
              Loading collaborators…
            </Text>
          ) : eligibleEditors.length ? (
            <View className="mb-3 gap-2">
              {eligibleEditors.map((member) => {
                const checked = selectedMemberIds.includes(member.userId);
                return (
                  <Pressable
                    key={member.userId}
                    onPress={() => toggleMember(member.userId)}
                    accessibilityRole="button"
                    className="flex-row items-center justify-between rounded-xl border px-3 py-2.5"
                    style={{ borderColor: checked ? colors.accent : colors.border }}
                  >
                    <Text className="font-semibold" style={{ color: colors.text }}>
                      {member.user.fullName}
                    </Text>
                    <View
                      className="h-5 w-5 items-center justify-center rounded-md border"
                      style={{ borderColor: colors.accent, backgroundColor: checked ? colors.accent : 'transparent' }}
                    >
                      {checked ? <Text style={{ color: colors.accentText }}>✓</Text> : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <Text className="mb-3 text-sm" style={{ color: colors.secondaryText }}>
              No accepted editors yet. Invite collaborators with an editable role first.
            </Text>
          )}

          {generateMutation.isError ? (
            <Text className="mb-2 text-sm" style={{ color: colors.error }}>
              {friendlyError(generateMutation.error, 'Could not generate a plan. Please try again.')}
            </Text>
          ) : null}

          <PrimaryButton
            onPress={runGenerate}
            loading={generateMutation.isPending}
            disabled={generateMutation.isPending || !selectedMemberIds.length}
          >
            {proposal ? 'Update Plan' : 'Generate Plan'}
          </PrimaryButton>
        </SectionCard>
      ) : null}

      {proposal && !showMemberPicker ? (
        <SectionCard className="mb-3">
          <Text className="mb-1 text-xs font-black uppercase tracking-wide" style={{ color: colors.accent }}>
            Proposed split
          </Text>
          <Text className="mb-3 text-sm leading-5" style={{ color: colors.text }}>
            {proposal.summary}
          </Text>

          {proposal.source === 'fallback' ? (
            <Text className="mb-3 text-xs font-bold" style={{ color: colors.warning }}>
              Generated without AI assistance — review carefully before accepting.
            </Text>
          ) : null}

          <View className="mb-3 gap-2">
            {proposal.workloadByMember.map((member) => (
              <View key={member.userId}>
                <View className="mb-1 flex-row items-center justify-between">
                  <Text className="text-sm font-semibold" style={{ color: colors.text }}>
                    {member.displayName}
                  </Text>
                  <Text className="text-xs" style={{ color: colors.secondaryText }}>
                    {member.itemCount} item{member.itemCount === 1 ? '' : 's'} · {formatMinutes(member.totalEstimatedMinutes)}
                  </Text>
                </View>
                <View className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: colors.progressTrack }}>
                  <View
                    style={{
                      width: `${Math.max(4, Math.round((member.totalEstimatedMinutes / maxMinutes) * 100))}%`,
                      height: '100%',
                      backgroundColor: colors.accent,
                      borderRadius: 999,
                    }}
                  />
                </View>
              </View>
            ))}
          </View>

          <Pressable onPress={() => setPlanExpanded((v) => !v)} accessibilityRole="button" className="mb-1">
            <Text className="text-xs font-bold" style={{ color: colors.accent }}>
              {planExpanded ? 'Hide full plan ▴' : `View full plan (${proposal.items.length}) ▾`}
            </Text>
          </Pressable>

          {planExpanded ? (
            <View className="mb-2 gap-2">
              {proposal.items.map((item) => (
                <View key={item.proposalId} className="rounded-xl px-3 py-2.5" style={{ backgroundColor: colors.background }}>
                  <Text className="text-sm font-semibold" style={{ color: colors.text }}>
                    {item.title}
                  </Text>
                  <Text className="mt-0.5 text-xs" style={{ color: colors.secondaryText }}>
                    {item.assigneeDisplayName ?? 'Unassigned'} · {formatMinutes(item.estimatedDurationMinutes)}
                  </Text>
                  {item.reason ? (
                    <Text className="mt-1 text-[11px]" style={{ color: colors.secondaryText }}>
                      Why: {item.reason}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}

          {applyMutation.isError ? (
            <Text className="mb-2 text-sm" style={{ color: colors.error }}>
              {friendlyError(applyMutation.error, 'Could not apply the plan. Please try again.')}
            </Text>
          ) : null}
          {appliedNotice ? (
            <Text className="mb-2 text-sm font-semibold" style={{ color: colors.success }}>
              {appliedNotice}
            </Text>
          ) : null}

          <View className="flex-row gap-2">
            <OutlineButton className="flex-1" onPress={() => setShowMemberPicker(true)} disabled={applyMutation.isPending}>
              Adjust
            </OutlineButton>
            <SecondaryButton className="flex-1" onPress={runGenerate} loading={generateMutation.isPending} disabled={applyMutation.isPending}>
              Regenerate
            </SecondaryButton>
          </View>
          <View className="mt-2">
            <PrimaryButton onPress={runApply} loading={applyMutation.isPending} disabled={applyMutation.isPending || Boolean(appliedNotice)}>
              Accept Plan
            </PrimaryButton>
          </View>
        </SectionCard>
      ) : null}
    </View>
  );
}
