import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import type { ApiTask } from '../../../lib/tasksApi';
import { useTheme } from '../../../theme/useTheme';
import {
  applyCollaborationPlan,
  generateCollaborationPlan,
  type ActivityType,
  type ApplyPlanItemInput,
  type CollaborationPlanItem,
  type CollaborationPlanPreferencesInput,
  type CollaborationPlanProposal,
  type PlanPriority,
  type TaskGranularity,
  type TaskTypeOverride,
  type WorkloadDistribution,
} from '../api/ai-collaboration-planner.api';
import { getMembers } from '../api/collaboration.api';
import { friendlyError } from '../errorMessages';
import type { TaskMember } from '../types';

type Props = {
  visible: boolean;
  task: ApiTask;
  onClose: () => void;
  /** Called once at least one item was actually applied — the caller should refetch the task. */
  onApplied: () => void;
};

type Step = 'select' | 'review';

const PRIORITIES: PlanPriority[] = ['low', 'medium', 'high', 'urgent'];

const ACTIVITY_TYPES: ActivityType[] = [
  'preparation',
  'study_review',
  'practice',
  'error_analysis',
  'shared_session',
  'production',
  'other',
];

const ACTIVITY_LABELS: Record<ActivityType, string> = {
  preparation: 'Prepares resource',
  study_review: 'Studies & reviews',
  practice: 'Practices (full scope)',
  error_analysis: 'Error analysis',
  shared_session: 'Shared session',
  production: 'Produces output',
  other: 'Other',
};

let localIdCounter = 0;
function nextLocalProposalId() {
  localIdCounter += 1;
  return `local-${Date.now()}-${localIdCounter}`;
}

/**
 * Owner-only AI Collaboration Planner: select the team, configure
 * preferences, generate a structured proposal, edit it, then apply all or
 * selected items. Mirrors the web AiCollaborationPlannerModal behavior.
 */
export function AiCollaborationPlannerModal({ visible, task, onClose, onApplied }: Props) {
  const { theme } = useTheme();
  const { colors } = theme;

  const [step, setStep] = useState<Step>('select');
  const [members, setMembers] = useState<TaskMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);

  const [workloadDistribution, setWorkloadDistribution] = useState<WorkloadDistribution>('equal');
  const [taskType, setTaskType] = useState<TaskTypeOverride>('auto');
  const [includeOwner, setIncludeOwner] = useState(false);
  const [allowParallelWork, setAllowParallelWork] = useState(true);
  const [addReviewSteps, setAddReviewSteps] = useState(false);
  const [addBufferTime, setAddBufferTime] = useState(true);
  const [taskGranularity, setTaskGranularity] = useState<TaskGranularity>('medium');
  const [notes, setNotes] = useState('');

  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [proposal, setProposal] = useState<CollaborationPlanProposal | null>(null);
  const [items, setItems] = useState<CollaborationPlanItem[]>([]);
  const [includedIds, setIncludedIds] = useState<Set<string>>(new Set());

  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState('');
  const [confirmMode, setConfirmMode] = useState<'all' | 'selected' | null>(null);
  const [appliedAny, setAppliedAny] = useState(false);

  const owner = task.viewerRole === 'owner';

  useEffect(() => {
    if (!visible) return;
    let active = true;
    setLoadingMembers(true);
    getMembers(task.id)
      .then((rows) => {
        if (active) setMembers(rows);
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
  }, [visible, task.id]);

  useEffect(() => {
    if (!visible) {
      setStep('select');
      setProposal(null);
      setItems([]);
      setIncludedIds(new Set());
      setAppliedAny(false);
      setGenError('');
      setApplyError('');
      setConfirmMode(null);
    }
  }, [visible]);

  const eligibleEditors = useMemo(
    () => members.filter((m) => m.status === 'accepted' && m.role === 'editor'),
    [members],
  );
  const ownerMember = useMemo(() => members.find((m) => m.isOwner) ?? null, [members]);

  const assignableOptions = useMemo(() => {
    const options: { userId: string; label: string }[] = [];
    if (includeOwner && ownerMember) {
      options.push({ userId: ownerMember.userId, label: `${ownerMember.user.fullName} (owner)` });
    }
    for (const id of selectedMemberIds) {
      const member = eligibleEditors.find((m) => m.userId === id);
      if (member) options.push({ userId: member.userId, label: member.user.fullName });
    }
    return options;
  }, [includeOwner, ownerMember, selectedMemberIds, eligibleEditors]);

  function toggleMember(userId: string) {
    setSelectedMemberIds((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
  }

  function buildPreferences(): CollaborationPlanPreferencesInput {
    return {
      workloadDistribution,
      taskType,
      includeOwner,
      allowParallelWork,
      addReviewSteps,
      addBufferTime,
      taskGranularity,
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };
  }

  const runGenerate = useCallback(async () => {
    // Guard against duplicate concurrent generate calls in addition to the
    // disabled buttons — this is the actual source of truth.
    if (generating) return;
    if (!selectedMemberIds.length) {
      setGenError('Select at least one collaborator to plan for.');
      return;
    }
    setGenerating(true);
    setGenError('');
    try {
      const result = await generateCollaborationPlan(task.id, {
        selectedMemberIds,
        preferences: buildPreferences(),
      });
      setProposal(result);
      setItems(result.items);
      setIncludedIds(new Set(result.items.map((item) => item.proposalId)));
      setStep('review');
    } catch (err) {
      setGenError(friendlyError(err, 'Could not generate a plan. Please try again.'));
    } finally {
      setGenerating(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    generating,
    task.id,
    selectedMemberIds,
    workloadDistribution,
    taskType,
    includeOwner,
    allowParallelWork,
    addReviewSteps,
    addBufferTime,
    taskGranularity,
    notes,
  ]);

  function updateItem(proposalId: string, patch: Partial<CollaborationPlanItem>) {
    setItems((prev) => prev.map((item) => (item.proposalId === proposalId ? { ...item, ...patch } : item)));
  }

  function removeItem(proposalId: string) {
    setItems((prev) => prev.filter((item) => item.proposalId !== proposalId));
    setIncludedIds((prev) => {
      const next = new Set(prev);
      next.delete(proposalId);
      return next;
    });
  }

  function addManualItem() {
    const proposalId = nextLocalProposalId();
    const newItem: CollaborationPlanItem = {
      proposalId,
      title: 'New subtask',
      description: '',
      assigneeUserId: null,
      assigneeDisplayName: null,
      estimatedDurationMinutes: 60,
      suggestedStart: null,
      suggestedDue: null,
      priority: 'medium',
      order: items.length + 1,
      dependsOnProposalIds: [],
      canRunInParallel: true,
      reason: 'Added manually by the task owner.',
      assumptions: [],
      warnings: [],
      activityType: proposal?.taskCollaborationType === 'shared_outcome' ? 'study_review' : 'production',
      sharedSessionId: null,
    };
    setItems((prev) => [...prev, newItem]);
    setIncludedIds((prev) => new Set(prev).add(proposalId));
  }

  function toggleIncluded(proposalId: string) {
    setIncludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(proposalId)) next.delete(proposalId);
      else next.add(proposalId);
      return next;
    });
  }

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

  const runApply = useCallback(
    async (mode: 'all' | 'selected') => {
      const toApply = (mode === 'all' ? items : items.filter((item) => includedIds.has(item.proposalId))).filter(
        (item) => item.title.trim(),
      );
      if (!toApply.length) {
        setApplyError('Select at least one item to apply.');
        return;
      }
      if (!proposal) return;
      setApplying(true);
      setApplyError('');
      try {
        const result = await applyCollaborationPlan(task.id, proposal.planId, toApply.map(toApplyInput));
        const createdCount = result.created.subtaskIds.length;
        if (createdCount > 0) {
          setAppliedAny(true);
          onApplied();
          const appliedIds = new Set(toApply.map((item) => item.proposalId));
          const skippedIds = new Set(result.itemErrors.map((e) => e.proposalId));
          setItems((prev) => prev.filter((item) => !appliedIds.has(item.proposalId) || skippedIds.has(item.proposalId)));
          setIncludedIds((prev) => {
            const next = new Set(prev);
            appliedIds.forEach((id) => next.delete(id));
            return next;
          });
        }
        if (result.itemErrors.length) {
          setApplyError(`${result.itemErrors.length} item(s) could not be applied: ${result.itemErrors.map((e) => e.error).join('; ')}`);
        }
      } catch (err) {
        setApplyError(friendlyError(err, 'Could not apply the plan. Please try again.'));
      } finally {
        setApplying(false);
        setConfirmMode(null);
      }
    },
    [items, includedIds, task.id, onApplied, proposal],
  );

  const unassignedCount = items.filter((item) => !item.assigneeUserId).length;

  const inputStyle = {
    borderColor: colors.border,
    color: colors.text,
    backgroundColor: colors.background,
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View className="flex-1" style={{ backgroundColor: colors.surface }}>
        <View
          className="flex-row items-center justify-between border-b px-4 py-3"
          style={{ borderColor: colors.border }}
        >
          <Text className="text-base font-black" style={{ color: colors.text }}>
            AI Collaboration Planner
          </Text>
          <Pressable onPress={onClose}>
            <Text className="text-lg font-bold" style={{ color: colors.secondaryText }}>
              ✕
            </Text>
          </Pressable>
        </View>

        {!owner ? (
          <View className="p-5">
            <Text style={{ color: colors.error }}>Only the task owner can use the AI Collaboration Planner.</Text>
          </View>
        ) : (
          <ScrollView className="flex-1 px-4 py-4" contentContainerStyle={{ paddingBottom: 40 }}>
            {step === 'select' ? (
              <View className="gap-4">
                <View>
                  <Text className="mb-2 text-xs font-black uppercase" style={{ color: colors.secondaryText }}>
                    1. Select team members
                  </Text>
                  {loadingMembers ? (
                    <Text style={{ color: colors.secondaryText }}>Loading collaborators…</Text>
                  ) : eligibleEditors.length ? (
                    <View className="gap-2">
                      {eligibleEditors.map((member) => {
                        const checked = selectedMemberIds.includes(member.userId);
                        return (
                          <Pressable
                            key={member.userId}
                            onPress={() => toggleMember(member.userId)}
                            className="flex-row items-center justify-between rounded-xl border px-3 py-2.5"
                            style={{ borderColor: checked ? colors.accent : colors.border }}
                          >
                            <Text style={{ color: colors.text }} className="font-semibold">
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
                    <Text style={{ color: colors.secondaryText }}>
                      No accepted editors yet. Invite collaborators with an editable role first.
                    </Text>
                  )}
                </View>

                <View>
                  <Text className="mb-2 text-xs font-black uppercase" style={{ color: colors.secondaryText }}>
                    2. Planning preferences
                  </Text>

                  <Text className="mb-1 text-xs font-bold" style={{ color: colors.secondaryText }}>
                    Workload distribution
                  </Text>
                  <View className="mb-3 flex-row flex-wrap gap-2">
                    {(['equal', 'availability', 'role', 'custom'] as WorkloadDistribution[]).map((option) => (
                      <Pressable
                        key={option}
                        onPress={() => setWorkloadDistribution(option)}
                        className="rounded-full border px-3 py-1.5"
                        style={{
                          borderColor: colors.border,
                          backgroundColor: workloadDistribution === option ? colors.accent : 'transparent',
                        }}
                      >
                        <Text
                          className="text-xs font-bold"
                          style={{ color: workloadDistribution === option ? colors.accentText : colors.text }}
                        >
                          {option}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  <Text className="mb-1 text-xs font-bold" style={{ color: colors.secondaryText }}>
                    Task type
                  </Text>
                  <View className="mb-1 flex-row flex-wrap gap-2">
                    {(['auto', 'shared_outcome', 'divisible'] as TaskTypeOverride[]).map((option) => (
                      <Pressable
                        key={option}
                        onPress={() => setTaskType(option)}
                        className="rounded-full border px-3 py-1.5"
                        style={{
                          borderColor: colors.border,
                          backgroundColor: taskType === option ? colors.accent : 'transparent',
                        }}
                      >
                        <Text
                          className="text-xs font-bold"
                          style={{ color: taskType === option ? colors.accentText : colors.text }}
                        >
                          {option === 'auto' ? 'Auto-detect' : option === 'shared_outcome' ? 'Shared study' : 'Divisible'}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <Text className="mb-3 text-[11px]" style={{ color: colors.secondaryText }}>
                    Shared study tasks require every participant to cover the full scope — preparation can be split,
                    but learning can&apos;t.
                  </Text>

                  <Text className="mb-1 text-xs font-bold" style={{ color: colors.secondaryText }}>
                    Task granularity
                  </Text>
                  <View className="mb-3 flex-row flex-wrap gap-2">
                    {(['coarse', 'medium', 'fine'] as TaskGranularity[]).map((option) => (
                      <Pressable
                        key={option}
                        onPress={() => setTaskGranularity(option)}
                        className="rounded-full border px-3 py-1.5"
                        style={{
                          borderColor: colors.border,
                          backgroundColor: taskGranularity === option ? colors.accent : 'transparent',
                        }}
                      >
                        <Text
                          className="text-xs font-bold"
                          style={{ color: taskGranularity === option ? colors.accentText : colors.text }}
                        >
                          {option}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  <ToggleRow label="Include me in execution" value={includeOwner} onChange={setIncludeOwner} colors={colors} />
                  <ToggleRow label="Allow parallel work" value={allowParallelWork} onChange={setAllowParallelWork} colors={colors} />
                  <ToggleRow label="Add review / quality-check steps" value={addReviewSteps} onChange={setAddReviewSteps} colors={colors} />
                  <ToggleRow label="Add buffer time before the deadline" value={addBufferTime} onChange={setAddBufferTime} colors={colors} />

                  <Text className="mb-1 mt-2 text-xs font-bold" style={{ color: colors.secondaryText }}>
                    Notes for the AI (optional)
                  </Text>
                  <TextInput
                    multiline
                    numberOfLines={3}
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="e.g. Alex is stronger on design work; keep QA for the last two days."
                    placeholderTextColor={colors.secondaryText}
                    className="rounded-lg border px-3 py-2 text-sm"
                    style={inputStyle}
                  />
                </View>

                {generating ? <GeneratingBanner colors={colors} /> : null}
                {genError ? <Text style={{ color: colors.error }}>{genError}</Text> : null}

                <Pressable
                  disabled={generating || !selectedMemberIds.length}
                  onPress={() => void runGenerate()}
                  className="items-center rounded-xl px-4 py-3"
                  style={{ backgroundColor: colors.accent, opacity: generating || !selectedMemberIds.length ? 0.5 : 1 }}
                >
                  <Text className="font-black" style={{ color: colors.accentText }}>
                    {generating ? 'Generating…' : 'Generate Plan'}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View className="gap-4">
                {proposal ? (
                  <>
                    <View className="rounded-xl border p-3" style={{ borderColor: colors.border }}>
                      {proposal.taskCollaborationType === 'shared_outcome' ? (
                        <View
                          className="mb-2 rounded-lg border px-3 py-2"
                          style={{ borderColor: colors.accent, backgroundColor: `${colors.accent}1a` }}
                        >
                          <Text className="text-xs font-semibold" style={{ color: colors.text }}>
                            📚 Shared study task — preparation is divided, but every participant still has their own
                            full-scope study, practice, and error-analysis coverage.
                          </Text>
                        </View>
                      ) : null}
                      {proposal.recoveryMode ? (
                        <View
                          className="mb-2 rounded-lg border px-3 py-2"
                          style={{ borderColor: colors.error, backgroundColor: `${colors.error}1a` }}
                        >
                          <Text className="text-xs font-semibold" style={{ color: colors.error }}>
                            ⏰ Recovery mode — the due date has already passed. Essential learning/practice is
                            prioritized over optional polish.
                          </Text>
                        </View>
                      ) : null}
                      <Text style={{ color: colors.text }}>{proposal.summary}</Text>
                      {proposal.source === 'fallback' ? (
                        <Text className="mt-1 text-xs font-bold" style={{ color: colors.warning }}>
                          Generated without AI assistance — review carefully before applying.
                        </Text>
                      ) : null}
                      <Text className="mt-2 text-xs" style={{ color: colors.secondaryText }}>
                        Total est.: {items.reduce((sum, i) => sum + i.estimatedDurationMinutes, 0)} min ·{' '}
                        {proposal.deadlineFeasible ? '✓ Deadline feasible' : '⚠ Deadline may be unrealistic'}
                        {unassignedCount ? ` · ⚠ ${unassignedCount} unassigned` : ''}
                      </Text>
                      {proposal.risks.map((risk, i) => (
                        <Text key={i} className="mt-1 text-xs" style={{ color: colors.error }}>
                          • {risk}
                        </Text>
                      ))}
                      {proposal.warnings.map((warning, i) => (
                        <Text key={i} className="mt-1 text-xs" style={{ color: colors.warning }}>
                          ⚠ {warning}
                        </Text>
                      ))}
                    </View>

                    <View className="flex-row items-center justify-between">
                      <Text className="text-xs font-black uppercase" style={{ color: colors.secondaryText }}>
                        Proposed subtasks ({items.length})
                      </Text>
                      <Pressable onPress={addManualItem}>
                        <Text className="text-xs font-bold" style={{ color: colors.accent }}>
                          + Add item
                        </Text>
                      </Pressable>
                    </View>

                    {items.map((item) => (
                      <PlanItemCard
                        key={item.proposalId}
                        item={item}
                        included={includedIds.has(item.proposalId)}
                        assignableOptions={assignableOptions}
                        colors={colors}
                        onToggleIncluded={() => toggleIncluded(item.proposalId)}
                        onChange={(patch) => updateItem(item.proposalId, patch)}
                        onRemove={() => removeItem(item.proposalId)}
                      />
                    ))}
                    {!items.length ? (
                      <Text style={{ color: colors.secondaryText }}>No items left. Add one or regenerate the plan.</Text>
                    ) : null}

                    {generating ? <GeneratingBanner colors={colors} /> : null}
                    {genError ? <Text style={{ color: colors.error }}>{genError}</Text> : null}
                    {applyError ? <Text style={{ color: colors.error }}>{applyError}</Text> : null}

                    {confirmMode ? (
                      <View
                        className="rounded-xl border p-3"
                        style={{ borderColor: colors.warning, backgroundColor: `${colors.warning}1a` }}
                      >
                        <Text style={{ color: colors.text }} className="mb-2">
                          Apply {confirmMode === 'all' ? items.length : includedIds.size} item(s) as real subtasks?
                        </Text>
                        <View className="flex-row gap-2">
                          <Pressable
                            onPress={() => setConfirmMode(null)}
                            className="flex-1 items-center rounded-lg border px-3 py-2"
                            style={{ borderColor: colors.border }}
                          >
                            <Text style={{ color: colors.text }}>Cancel</Text>
                          </Pressable>
                          <Pressable
                            disabled={applying}
                            onPress={() => void runApply(confirmMode)}
                            className="flex-1 items-center rounded-lg px-3 py-2"
                            style={{ backgroundColor: colors.warning, opacity: applying ? 0.6 : 1 }}
                          >
                            <Text className="font-black" style={{ color: colors.accentText }}>
                              {applying ? 'Applying…' : 'Confirm'}
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : (
                      <View className="gap-2">
                        <View className="flex-row gap-2">
                          <Pressable
                            onPress={() => setStep('select')}
                            className="flex-1 items-center rounded-lg border px-3 py-2.5"
                            style={{ borderColor: colors.border }}
                          >
                            <Text style={{ color: colors.text }}>Back</Text>
                          </Pressable>
                          <Pressable
                            disabled={generating}
                            onPress={() => void runGenerate()}
                            className="flex-1 items-center rounded-lg border px-3 py-2.5"
                            style={{ borderColor: colors.border, opacity: generating ? 0.6 : 1 }}
                          >
                            <Text style={{ color: colors.text }}>{generating ? 'Regenerating…' : 'Regenerate'}</Text>
                          </Pressable>
                        </View>
                        <Pressable
                          disabled={!includedIds.size || applying}
                          onPress={() => setConfirmMode('selected')}
                          className="items-center rounded-lg border-2 px-3 py-2.5"
                          style={{ borderColor: colors.accent, opacity: !includedIds.size || applying ? 0.5 : 1 }}
                        >
                          <Text className="font-black" style={{ color: colors.accent }}>
                            Apply Selected ({includedIds.size})
                          </Text>
                        </Pressable>
                        <Pressable
                          disabled={!items.length || applying}
                          onPress={() => setConfirmMode('all')}
                          className="items-center rounded-lg px-3 py-2.5"
                          style={{ backgroundColor: colors.accent, opacity: !items.length || applying ? 0.5 : 1 }}
                        >
                          <Text className="font-black" style={{ color: colors.accentText }}>
                            Apply Full Plan
                          </Text>
                        </Pressable>
                        {appliedAny ? (
                          <Pressable
                            onPress={onClose}
                            className="items-center rounded-lg px-3 py-2.5"
                            style={{ backgroundColor: colors.success }}
                          >
                            <Text className="font-black" style={{ color: colors.accentText }}>
                              Done
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>
                    )}
                  </>
                ) : null}
              </View>
            )}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

function GeneratingBanner({ colors }: { colors: ReturnType<typeof useTheme>['theme']['colors'] }) {
  return (
    <View
      accessibilityRole="alert"
      className="flex-row items-center gap-3 rounded-xl border px-4 py-3"
      style={{ borderColor: colors.accent, backgroundColor: `${colors.accent}1a` }}
    >
      <ActivityIndicator color={colors.accent} />
      <View className="flex-1">
        <Text className="text-sm font-bold" style={{ color: colors.text }}>
          Generating your collaboration plan…
        </Text>
        <Text className="text-xs" style={{ color: colors.secondaryText }}>
          This may take up to 90 seconds.
        </Text>
      </View>
    </View>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
  colors,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  colors: ReturnType<typeof useTheme>['theme']['colors'];
}) {
  return (
    <View className="mb-2 flex-row items-center justify-between">
      <Text className="flex-1 pr-2 text-sm" style={{ color: colors.text }}>
        {label}
      </Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.accent }} />
    </View>
  );
}

function PlanItemCard({
  item,
  included,
  assignableOptions,
  colors,
  onToggleIncluded,
  onChange,
  onRemove,
}: {
  item: CollaborationPlanItem;
  included: boolean;
  assignableOptions: { userId: string; label: string }[];
  colors: ReturnType<typeof useTheme>['theme']['colors'];
  onToggleIncluded: () => void;
  onChange: (patch: Partial<CollaborationPlanItem>) => void;
  onRemove: () => void;
}) {
  const inputStyle = { borderColor: colors.border, color: colors.text, backgroundColor: colors.background };

  return (
    <View
      className="rounded-xl border p-3"
      style={{ borderColor: included ? colors.accent : colors.border, opacity: included ? 1 : 0.6 }}
    >
      <View className="mb-2 flex-row items-center gap-2">
        <Pressable
          onPress={onToggleIncluded}
          className="h-5 w-5 items-center justify-center rounded-md border"
          style={{ borderColor: colors.accent, backgroundColor: included ? colors.accent : 'transparent' }}
        >
          {included ? <Text style={{ color: colors.accentText, fontSize: 12 }}>✓</Text> : null}
        </Pressable>
        <TextInput
          value={item.title}
          onChangeText={(text) => onChange({ title: text })}
          className="flex-1 rounded-lg border px-2 py-1.5 text-sm font-bold"
          style={inputStyle}
        />
        <Pressable onPress={onRemove} className="rounded-lg border px-2 py-1.5" style={{ borderColor: colors.error }}>
          <Text style={{ color: colors.error }} className="text-xs font-bold">
            Remove
          </Text>
        </Pressable>
      </View>

      <Text className="mb-1 text-[10px] font-bold uppercase" style={{ color: colors.secondaryText }}>
        Activity type
      </Text>
      <View className="mb-2 flex-row flex-wrap gap-1.5">
        {ACTIVITY_TYPES.map((type) => (
          <Pressable
            key={type}
            onPress={() => onChange({ activityType: type })}
            className="rounded-full border px-2.5 py-1"
            style={{
              borderColor: colors.accent,
              backgroundColor: item.activityType === type ? colors.accent : 'transparent',
            }}
          >
            <Text
              className="text-[11px]"
              style={{ color: item.activityType === type ? colors.accentText : colors.text }}
            >
              {ACTIVITY_LABELS[type]}
            </Text>
          </Pressable>
        ))}
      </View>

      <TextInput
        value={item.description}
        onChangeText={(text) => onChange({ description: text })}
        placeholder="Description"
        placeholderTextColor={colors.secondaryText}
        multiline
        className="mb-2 rounded-lg border px-2 py-1.5 text-xs"
        style={inputStyle}
      />

      <Text className="mb-1 text-[10px] font-bold uppercase" style={{ color: colors.secondaryText }}>
        Assignee
      </Text>
      <View className="mb-2 flex-row flex-wrap gap-1.5">
        <Pressable
          onPress={() => onChange({ assigneeUserId: null, assigneeDisplayName: null })}
          className="rounded-full border px-2.5 py-1"
          style={{
            borderColor: colors.border,
            backgroundColor: !item.assigneeUserId ? colors.accent : 'transparent',
          }}
        >
          <Text className="text-[11px]" style={{ color: !item.assigneeUserId ? colors.accentText : colors.text }}>
            Unassigned
          </Text>
        </Pressable>
        {assignableOptions.map((o) => (
          <Pressable
            key={o.userId}
            onPress={() => onChange({ assigneeUserId: o.userId, assigneeDisplayName: o.label })}
            className="rounded-full border px-2.5 py-1"
            style={{
              borderColor: colors.border,
              backgroundColor: item.assigneeUserId === o.userId ? colors.accent : 'transparent',
            }}
          >
            <Text
              className="text-[11px]"
              style={{ color: item.assigneeUserId === o.userId ? colors.accentText : colors.text }}
            >
              {o.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text className="mb-1 text-[10px] font-bold uppercase" style={{ color: colors.secondaryText }}>
        Priority
      </Text>
      <View className="mb-2 flex-row flex-wrap gap-1.5">
        {PRIORITIES.map((p) => (
          <Pressable
            key={p}
            onPress={() => onChange({ priority: p })}
            className="rounded-full border px-2.5 py-1"
            style={{ borderColor: colors.border, backgroundColor: item.priority === p ? colors.accent : 'transparent' }}
          >
            <Text className="text-[11px]" style={{ color: item.priority === p ? colors.accentText : colors.text }}>
              {p}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text className="mb-1 text-[10px] font-bold uppercase" style={{ color: colors.secondaryText }}>
        Estimated duration (minutes)
      </Text>
      <TextInput
        keyboardType="number-pad"
        value={String(item.estimatedDurationMinutes)}
        onChangeText={(text) => onChange({ estimatedDurationMinutes: Number(text.replace(/[^0-9]/g, '')) || 0 })}
        className="mb-2 rounded-lg border px-2 py-1.5 text-sm"
        style={inputStyle}
      />

      <View className="mb-2 flex-row items-center justify-between">
        <Text className="text-xs" style={{ color: colors.text }}>
          Can run in parallel
        </Text>
        <Switch
          value={item.canRunInParallel}
          onValueChange={(value) => onChange({ canRunInParallel: value })}
          trackColor={{ true: colors.accent }}
        />
      </View>

      {item.reason ? (
        <Text className="text-[11px]" style={{ color: colors.secondaryText }}>
          Why: {item.reason}
        </Text>
      ) : null}
      {item.warnings.length ? (
        <Text className="mt-1 text-[11px] font-semibold" style={{ color: colors.warning }}>
          ⚠ {item.warnings.join(' ')}
        </Text>
      ) : null}
      {item.assumptions.length ? (
        <Text className="mt-1 text-[11px]" style={{ color: colors.secondaryText }}>
          Assumption: {item.assumptions.join(' ')}
        </Text>
      ) : null}
    </View>
  );
}
