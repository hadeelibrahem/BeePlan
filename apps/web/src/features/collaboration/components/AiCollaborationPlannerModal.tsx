import { useCallback, useEffect, useMemo, useState } from "react";
import type { ApiTask } from "../../../lib/tasksApi";
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
} from "../api/ai-collaboration-planner.api";
import { getMembers } from "../api/collaboration.api";
import { friendlyError } from "../errorMessages";
import type { TaskMember } from "../types";
import { Toast } from "./Toast";

type Props = {
  task: ApiTask;
  accessToken: string;
  onClose: () => void;
  /** Called once at least one item was actually applied — the caller should refetch the task. */
  onApplied: () => void;
};

type Step = "select" | "review";

const PRIORITIES: PlanPriority[] = ["low", "medium", "high", "urgent"];

const ACTIVITY_TYPES: ActivityType[] = [
  "preparation",
  "study_review",
  "practice",
  "error_analysis",
  "shared_session",
  "production",
  "other",
];

const ACTIVITY_LABELS: Record<ActivityType, string> = {
  preparation: "Prepares resource",
  study_review: "Studies & reviews",
  practice: "Practices (full scope)",
  error_analysis: "Error analysis",
  shared_session: "Shared session",
  production: "Produces output",
  other: "Other",
};

function toDateTimeLocal(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromDateTimeLocal(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

let localIdCounter = 0;
function nextLocalProposalId() {
  localIdCounter += 1;
  return `local-${Date.now()}-${localIdCounter}`;
}

const inputClass =
  "w-full rounded-lg border border-[var(--bp-border)] bg-[var(--bp-bg)] px-3 py-2 text-sm text-[var(--bp-text)] focus:border-[var(--bp-accent)] focus:outline-none";

/**
 * Owner-only AI Collaboration Planner: select the team, configure
 * preferences, generate a structured proposal, edit it, then apply all or
 * selected items. Never mutates the task until "Apply" is confirmed.
 */
export function AiCollaborationPlannerModal({
  task,
  accessToken,
  onClose,
  onApplied,
}: Props) {
  const [step, setStep] = useState<Step>("select");
  const [members, setMembers] = useState<TaskMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);

  const [workloadDistribution, setWorkloadDistribution] =
    useState<WorkloadDistribution>("equal");
  const [taskType, setTaskType] = useState<TaskTypeOverride>("auto");
  const [includeOwner, setIncludeOwner] = useState(false);
  const [maxWorkloadItemsPerPerson, setMaxWorkloadItemsPerPerson] =
    useState("");
  const [allowParallelWork, setAllowParallelWork] = useState(true);
  const [addReviewSteps, setAddReviewSteps] = useState(false);
  const [addBufferTime, setAddBufferTime] = useState(true);
  const [taskGranularity, setTaskGranularity] =
    useState<TaskGranularity>("medium");
  const [notes, setNotes] = useState("");

  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const [proposal, setProposal] = useState<CollaborationPlanProposal | null>(
    null,
  );
  const [items, setItems] = useState<CollaborationPlanItem[]>([]);
  const [includedIds, setIncludedIds] = useState<Set<string>>(new Set());

  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState("");
  const [confirmMode, setConfirmMode] = useState<"all" | "selected" | null>(
    null,
  );
  const [notice, setNotice] = useState("");
  const [appliedAny, setAppliedAny] = useState(false);

  const owner = task.viewerRole === "owner";

  useEffect(() => {
    let active = true;
    setLoadingMembers(true);
    getMembers(task.id, accessToken)
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
  }, [task.id, accessToken]);

  // Only accepted collaborators with an editable role can be planned for —
  // pending/declined invitees and viewers (unless promoted) are excluded.
  const eligibleEditors = useMemo(
    () => members.filter((m) => m.status === "accepted" && m.role === "editor"),
    [members],
  );
  const ownerMember = useMemo(
    () => members.find((m) => m.isOwner) ?? null,
    [members],
  );

  const assignableOptions = useMemo(() => {
    const options: { userId: string; label: string }[] = [];
    if (includeOwner && ownerMember) {
      options.push({
        userId: ownerMember.userId,
        label: `${ownerMember.user.fullName} (owner)`,
      });
    }
    for (const id of selectedMemberIds) {
      const member = eligibleEditors.find((m) => m.userId === id);
      if (member)
        options.push({ userId: member.userId, label: member.user.fullName });
    }
    return options;
  }, [includeOwner, ownerMember, selectedMemberIds, eligibleEditors]);

  function toggleMember(userId: string) {
    setSelectedMemberIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId],
    );
  }

  function buildPreferences(): CollaborationPlanPreferencesInput {
    const maxItems = Number(maxWorkloadItemsPerPerson);
    return {
      workloadDistribution,
      taskType,
      includeOwner,
      ...(maxWorkloadItemsPerPerson && Number.isFinite(maxItems) && maxItems > 0
        ? { maxWorkloadItemsPerPerson: Math.round(maxItems) }
        : {}),
      allowParallelWork,
      addReviewSteps,
      addBufferTime,
      taskGranularity,
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };
  }

  const runGenerate = useCallback(async () => {
    // Guard against duplicate concurrent generate calls (double-click, Enter
    // while a request is already in flight, etc.) in addition to the
    // disabled buttons — this is the actual source of truth.
    if (generating) return;
    if (!selectedMemberIds.length) {
      setGenError("Select at least one collaborator to plan for.");
      return;
    }
    setGenerating(true);
    setGenError("");
    try {
      const result = await generateCollaborationPlan(
        task.id,
        { selectedMemberIds, preferences: buildPreferences() },
        accessToken,
      );
      setProposal(result);
      setItems(result.items);
      setIncludedIds(new Set(result.items.map((item) => item.proposalId)));
      setStep("review");
    } catch (err) {
      setGenError(
        friendlyError(err, "Could not generate a plan. Please try again."),
      );
    } finally {
      setGenerating(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    generating,
    task.id,
    accessToken,
    selectedMemberIds,
    workloadDistribution,
    taskType,
    includeOwner,
    maxWorkloadItemsPerPerson,
    allowParallelWork,
    addReviewSteps,
    addBufferTime,
    taskGranularity,
    notes,
  ]);

  function updateItem(
    proposalId: string,
    patch: Partial<CollaborationPlanItem>,
  ) {
    setItems((prev) =>
      prev.map((item) =>
        item.proposalId === proposalId ? { ...item, ...patch } : item,
      ),
    );
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
      title: "New subtask",
      description: "",
      assigneeUserId: null,
      assigneeDisplayName: null,
      estimatedDurationMinutes: 60,
      suggestedStart: null,
      suggestedDue: null,
      priority: "medium",
      order: items.length + 1,
      dependsOnProposalIds: [],
      canRunInParallel: true,
      reason: "Added manually by the task owner.",
      assumptions: [],
      warnings: [],
      activityType:
        proposal?.taskCollaborationType === "shared_outcome"
          ? "study_review"
          : "production",
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
    async (mode: "all" | "selected") => {
      const toApply = (
        mode === "all"
          ? items
          : items.filter((item) => includedIds.has(item.proposalId))
      ).filter((item) => item.title.trim());
      if (!toApply.length) {
        setApplyError("Select at least one item to apply.");
        return;
      }
      if (!proposal) return;
      setApplying(true);
      setApplyError("");
      try {
        const result = await applyCollaborationPlan(
          task.id,
          proposal.planId,
          toApply.map(toApplyInput),
          accessToken,
        );
        const createdCount = result.created.subtaskIds.length;
        if (createdCount > 0) {
          setAppliedAny(true);
          setNotice(
            `Applied ${createdCount} subtask${createdCount === 1 ? "" : "s"}${
              result.itemErrors.length
                ? ` (${result.itemErrors.length} skipped)`
                : ""
            }.`,
          );
          onApplied();
          // Remove the applied items from the working set; keep any skipped ones visible for correction.
          const appliedIds = new Set(toApply.map((item) => item.proposalId));
          const skippedIds = new Set(
            result.itemErrors.map((e) => e.proposalId),
          );
          setItems((prev) =>
            prev.filter(
              (item) =>
                !appliedIds.has(item.proposalId) ||
                skippedIds.has(item.proposalId),
            ),
          );
          setIncludedIds((prev) => {
            const next = new Set(prev);
            appliedIds.forEach((id) => next.delete(id));
            return next;
          });
        }
        if (result.itemErrors.length) {
          setApplyError(
            `${result.itemErrors.length} item(s) could not be applied: ${result.itemErrors
              .map((e) => e.error)
              .join("; ")}`,
          );
        }
      } catch (err) {
        const apiErr = err as Error & {
          itemErrors?: { proposalId: string; error: string }[];
        };
        if (apiErr.itemErrors?.length) {
          setApplyError(apiErr.itemErrors.map((e) => e.error).join("; "));
        } else {
          setApplyError(
            friendlyError(err, "Could not apply the plan. Please try again."),
          );
        }
      } finally {
        setApplying(false);
        setConfirmMode(null);
      }
    },
    [items, includedIds, task.id, accessToken, onApplied, proposal],
  );

  const workloadDisplay = useMemo(() => {
    const byMember = new Map<
      string,
      { displayName: string; itemCount: number; totalMinutes: number }
    >();
    for (const item of items) {
      if (!item.assigneeUserId) continue;
      const label =
        assignableOptions.find((o) => o.userId === item.assigneeUserId)
          ?.label ??
        item.assigneeDisplayName ??
        "Unknown";
      const existing = byMember.get(item.assigneeUserId);
      if (existing) {
        existing.itemCount += 1;
        existing.totalMinutes += item.estimatedDurationMinutes;
      } else {
        byMember.set(item.assigneeUserId, {
          displayName: label,
          itemCount: 1,
          totalMinutes: item.estimatedDurationMinutes,
        });
      }
    }
    return [...byMember.values()];
  }, [items, assignableOptions]);

  const unassignedCount = items.filter((item) => !item.assigneeUserId).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--bp-border)] px-5 py-4">
          <h2 className="text-lg font-black text-[var(--bp-text)]">
            AI Collaboration Planner
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm font-bold text-slate-400 hover:text-[var(--bp-text)]"
          >
            ✕
          </button>
        </div>

        {!owner ? (
          <div className="p-6 text-sm text-red-300">
            Only the task owner can use the AI Collaboration Planner.
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {step === "select" ? (
              <div className="space-y-5">
                <section>
                  <h3 className="mb-2 text-sm font-black uppercase tracking-wide text-slate-300">
                    1. Select team members
                  </h3>
                  {loadingMembers ? (
                    <p className="text-sm text-slate-400">
                      Loading collaborators…
                    </p>
                  ) : eligibleEditors.length ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {eligibleEditors.map((member) => (
                        <label
                          key={member.userId}
                          className="flex items-center gap-2 rounded-lg border border-[var(--bp-border)] px-3 py-2 text-sm text-[var(--bp-text)]"
                        >
                          <input
                            type="checkbox"
                            checked={selectedMemberIds.includes(member.userId)}
                            onChange={() => toggleMember(member.userId)}
                          />
                          {member.user.fullName}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400">
                      No accepted editors yet. Invite collaborators with an
                      editable role first.
                    </p>
                  )}
                </section>

                <section>
                  <h3 className="mb-2 text-sm font-black uppercase tracking-wide text-slate-300">
                    2. Planning preferences
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-400">
                        Workload distribution
                      </label>
                      <select
                        className={inputClass}
                        value={workloadDistribution}
                        onChange={(e) =>
                          setWorkloadDistribution(
                            e.target.value as WorkloadDistribution,
                          )
                        }
                      >
                        <option value="equal">Equal</option>
                        <option value="availability">
                          Based on availability
                        </option>
                        <option value="role">Based on role</option>
                        <option value="custom">Custom (use notes below)</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-400">
                        Task type
                      </label>
                      <select
                        className={inputClass}
                        value={taskType}
                        onChange={(e) =>
                          setTaskType(e.target.value as TaskTypeOverride)
                        }
                      >
                        <option value="auto">Auto-detect</option>
                        <option value="shared_outcome">
                          Shared study (exam prep, revision, ...)
                        </option>
                        <option value="divisible">
                          Divisible project work
                        </option>
                      </select>
                      <p className="mt-1 text-[11px] text-slate-500">
                        Shared study tasks require every participant to cover
                        the full scope — preparation can be split, but learning
                        can&apos;t.
                      </p>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-400">
                        Task granularity
                      </label>
                      <select
                        className={inputClass}
                        value={taskGranularity}
                        onChange={(e) =>
                          setTaskGranularity(e.target.value as TaskGranularity)
                        }
                      >
                        <option value="coarse">Coarse (few big items)</option>
                        <option value="medium">Medium</option>
                        <option value="fine">Fine (many small items)</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-400">
                        Max items per person
                      </label>
                      <input
                        type="number"
                        min={1}
                        className={inputClass}
                        placeholder="No limit"
                        value={maxWorkloadItemsPerPerson}
                        onChange={(e) =>
                          setMaxWorkloadItemsPerPerson(e.target.value)
                        }
                      />
                    </div>
                    <div className="flex flex-col justify-center gap-2 pt-1">
                      <label className="flex items-center gap-2 text-sm text-[var(--bp-text)]">
                        <input
                          type="checkbox"
                          checked={includeOwner}
                          onChange={(e) => setIncludeOwner(e.target.checked)}
                        />
                        Include me in execution
                      </label>
                      <label className="flex items-center gap-2 text-sm text-[var(--bp-text)]">
                        <input
                          type="checkbox"
                          checked={allowParallelWork}
                          onChange={(e) =>
                            setAllowParallelWork(e.target.checked)
                          }
                        />
                        Allow parallel work
                      </label>
                      <label className="flex items-center gap-2 text-sm text-[var(--bp-text)]">
                        <input
                          type="checkbox"
                          checked={addReviewSteps}
                          onChange={(e) => setAddReviewSteps(e.target.checked)}
                        />
                        Add review / quality-check steps
                      </label>
                      <label className="flex items-center gap-2 text-sm text-[var(--bp-text)]">
                        <input
                          type="checkbox"
                          checked={addBufferTime}
                          onChange={(e) => setAddBufferTime(e.target.checked)}
                        />
                        Add buffer time before the deadline
                      </label>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-xs font-bold text-slate-400">
                        Notes for the AI (optional)
                      </label>
                      <textarea
                        className={inputClass}
                        rows={2}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="e.g. Alex is stronger on design work; keep QA for the last two days."
                      />
                    </div>
                  </div>
                </section>

                {generating ? <GeneratingBanner /> : null}
                {genError ? (
                  <p className="text-sm font-semibold text-red-300">
                    {genError}
                  </p>
                ) : null}

                <div className="flex justify-end gap-2 border-t border-[var(--bp-border)] pt-4">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg border border-[var(--bp-border)] px-4 py-2 text-sm font-bold text-[var(--bp-text)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={generating || !selectedMemberIds.length}
                    onClick={() => void runGenerate()}
                    className="rounded-lg bg-[var(--bp-accent)] px-4 py-2 text-sm font-black text-black disabled:opacity-50"
                  >
                    {generating ? "Generating…" : "Generate Plan"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                {proposal ? (
                  <>
                    <section className="rounded-xl border border-[var(--bp-border)] p-3">
                      {proposal.taskCollaborationType === "shared_outcome" ? (
                        <p className="mb-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-200">
                          📚 Shared study task — preparation is divided, but
                          every participant still has their own full-scope
                          study, practice, and error-analysis coverage.
                        </p>
                      ) : null}
                      {proposal.recoveryMode ? (
                        <p className="mb-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300">
                          ⏰ Recovery mode — the due date has already passed.
                          Essential learning/practice is prioritized over
                          optional polish.
                        </p>
                      ) : null}
                      <p className="text-sm text-[var(--bp-text)]">
                        {proposal.summary}
                      </p>
                      {proposal.source === "fallback" ? (
                        <p className="mt-1 text-xs font-bold text-amber-300">
                          Generated without AI assistance — review carefully
                          before applying.
                        </p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-400">
                        <span>
                          Total est.:{" "}
                          {items.reduce(
                            (sum, i) => sum + i.estimatedDurationMinutes,
                            0,
                          )}{" "}
                          min
                        </span>
                        <span>
                          {proposal.deadlineFeasible
                            ? "✓ Deadline looks feasible"
                            : "⚠ Deadline may be unrealistic"}
                        </span>
                        {unassignedCount ? (
                          <span>⚠ {unassignedCount} item(s) unassigned</span>
                        ) : null}
                        {proposal.suggestedBufferMinutes ? (
                          <span>
                            Suggested buffer: {proposal.suggestedBufferMinutes}{" "}
                            min
                          </span>
                        ) : null}
                      </div>
                      {proposal.reviewMilestone ? (
                        <p className="mt-1 text-xs text-slate-400">
                          Review milestone: {proposal.reviewMilestone.title}
                          {proposal.reviewMilestone.suggestedDate
                            ? ` — ${new Date(proposal.reviewMilestone.suggestedDate).toLocaleString()}`
                            : ""}
                        </p>
                      ) : null}
                      {proposal.risks.length ? (
                        <ul className="mt-2 list-disc pl-5 text-xs text-red-300">
                          {proposal.risks.map((risk, i) => (
                            <li key={i}>{risk}</li>
                          ))}
                        </ul>
                      ) : null}
                      {proposal.warnings.length ? (
                        <ul className="mt-2 list-disc pl-5 text-xs text-amber-300">
                          {proposal.warnings.map((warning, i) => (
                            <li key={i}>{warning}</li>
                          ))}
                        </ul>
                      ) : null}
                      {proposal.assumptions.length ? (
                        <ul className="mt-2 list-disc pl-5 text-xs text-slate-400">
                          {proposal.assumptions.map((assumption, i) => (
                            <li key={i}>{assumption}</li>
                          ))}
                        </ul>
                      ) : null}
                      {workloadDisplay.length ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {workloadDisplay.map((w) => (
                            <span
                              key={w.displayName}
                              className="rounded-full border border-[var(--bp-border)] px-2.5 py-1 text-xs font-bold text-[var(--bp-text)]"
                            >
                              {w.displayName}: {w.itemCount} items ·{" "}
                              {w.totalMinutes} min
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </section>

                    <section className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-black uppercase tracking-wide text-slate-300">
                          Proposed subtasks ({items.length})
                        </h3>
                        <button
                          type="button"
                          onClick={addManualItem}
                          className="text-xs font-bold text-[var(--bp-accent)]"
                        >
                          + Add item
                        </button>
                      </div>

                      {items.map((item) => (
                        <PlanItemCard
                          key={item.proposalId}
                          item={item}
                          included={includedIds.has(item.proposalId)}
                          assignableOptions={assignableOptions}
                          allItems={items}
                          onToggleIncluded={() =>
                            toggleIncluded(item.proposalId)
                          }
                          onChange={(patch) =>
                            updateItem(item.proposalId, patch)
                          }
                          onRemove={() => removeItem(item.proposalId)}
                        />
                      ))}
                      {!items.length ? (
                        <p className="text-sm text-slate-400">
                          No items left. Add one or regenerate the plan.
                        </p>
                      ) : null}
                    </section>

                    {generating ? <GeneratingBanner /> : null}
                    {genError ? (
                      <p className="text-sm font-semibold text-red-300">
                        {genError}
                      </p>
                    ) : null}
                    {applyError ? (
                      <p className="text-sm font-semibold text-red-300">
                        {applyError}
                      </p>
                    ) : null}

                    {confirmMode ? (
                      <div className="flex items-center justify-between rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                        <span>
                          Apply{" "}
                          {confirmMode === "all"
                            ? items.length
                            : includedIds.size}{" "}
                          item(s) as real subtasks?
                        </span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setConfirmMode(null)}
                            className="rounded-lg border border-[var(--bp-border)] px-3 py-1 text-xs font-bold"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={applying}
                            onClick={() => void runApply(confirmMode)}
                            className="rounded-lg bg-amber-400 px-3 py-1 text-xs font-black text-black disabled:opacity-50"
                          >
                            {applying ? "Applying…" : "Confirm"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--bp-border)] pt-4">
                        <button
                          type="button"
                          onClick={() => setStep("select")}
                          className="rounded-lg border border-[var(--bp-border)] px-4 py-2 text-sm font-bold text-[var(--bp-text)]"
                        >
                          Back
                        </button>
                        <button
                          type="button"
                          disabled={generating}
                          onClick={() => void runGenerate()}
                          className="rounded-lg border border-[var(--bp-border)] px-4 py-2 text-sm font-bold text-[var(--bp-text)] disabled:opacity-50"
                        >
                          {generating ? "Regenerating…" : "Regenerate"}
                        </button>
                        <button
                          type="button"
                          disabled={!includedIds.size || applying}
                          onClick={() => setConfirmMode("selected")}
                          className="rounded-lg border border-[var(--bp-accent)] px-4 py-2 text-sm font-black text-[var(--bp-accent)] disabled:opacity-50"
                        >
                          Apply Selected ({includedIds.size})
                        </button>
                        <button
                          type="button"
                          disabled={!items.length || applying}
                          onClick={() => setConfirmMode("all")}
                          className="rounded-lg bg-[var(--bp-accent)] px-4 py-2 text-sm font-black text-black disabled:opacity-50"
                        >
                          Apply Full Plan
                        </button>
                        {appliedAny ? (
                          <button
                            type="button"
                            onClick={onClose}
                            className="rounded-lg bg-green-500 px-4 py-2 text-sm font-black text-black"
                          >
                            Done
                          </button>
                        ) : null}
                      </div>
                    )}
                  </>
                ) : null}
              </div>
            )}
          </div>
        )}
      </div>
      <Toast message={notice} tone="success" onDone={() => setNotice("")} />
    </div>
  );
}

function GeneratingBanner() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-3 rounded-lg border border-[var(--bp-accent)]/40 bg-[var(--bp-accent)]/10 px-4 py-3"
    >
      <span
        className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[var(--bp-accent)] border-t-transparent"
        aria-hidden="true"
      />
      <div className="text-sm">
        <p className="font-bold text-[var(--bp-text)]">
          Generating your collaboration plan…
        </p>
        <p className="text-xs text-slate-400">
          This may take up to 90 seconds.
        </p>
      </div>
    </div>
  );
}

function PlanItemCard({
  item,
  included,
  assignableOptions,
  allItems,
  onToggleIncluded,
  onChange,
  onRemove,
}: {
  item: CollaborationPlanItem;
  included: boolean;
  assignableOptions: { userId: string; label: string }[];
  allItems: CollaborationPlanItem[];
  onToggleIncluded: () => void;
  onChange: (patch: Partial<CollaborationPlanItem>) => void;
  onRemove: () => void;
}) {
  const otherItems = allItems.filter(
    (other) => other.proposalId !== item.proposalId,
  );
  const dependencyItems = item.dependsOnProposalIds
    .map((id) => allItems.find((candidate) => candidate.proposalId === id))
    .filter((candidate): candidate is CollaborationPlanItem =>
      Boolean(candidate),
    );
  const availableDependencies = otherItems.filter(
    (other) => !item.dependsOnProposalIds.includes(other.proposalId),
  );

  function toggleDependency(depId: string) {
    const has = item.dependsOnProposalIds.includes(depId);
    onChange({
      dependsOnProposalIds: has
        ? item.dependsOnProposalIds.filter((id) => id !== depId)
        : [...item.dependsOnProposalIds, depId],
    });
  }

  return (
    <div
      className={`rounded-xl border p-3 ${included ? "border-[var(--bp-accent)]" : "border-[var(--bp-border)] opacity-70"}`}
    >
      <div className="mb-2 flex items-start gap-2">
        <input
          type="checkbox"
          checked={included}
          onChange={onToggleIncluded}
          className="mt-1.5"
        />
        <input
          className={`${inputClass} flex-1 font-bold`}
          value={item.title}
          onChange={(e) => onChange({ title: e.target.value })}
        />
        <button
          type="button"
          onClick={onRemove}
          className="rounded-lg border border-red-500/40 px-2 py-1 text-xs font-bold text-red-300"
        >
          Remove
        </button>
      </div>

      <div className="mb-2 flex items-center gap-2">
        <span className="rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-sky-200">
          {ACTIVITY_LABELS[item.activityType]}
        </span>
        <select
          className="rounded-lg border border-[var(--bp-border)] bg-[var(--bp-bg)] px-2 py-1 text-[11px] text-[var(--bp-text)]"
          value={item.activityType}
          onChange={(e) =>
            onChange({ activityType: e.target.value as ActivityType })
          }
        >
          {ACTIVITY_TYPES.map((type) => (
            <option key={type} value={type}>
              {ACTIVITY_LABELS[type]}
            </option>
          ))}
        </select>
      </div>

      <textarea
        className={`${inputClass} mb-2`}
        rows={2}
        value={item.description}
        placeholder="Description"
        onChange={(e) => onChange({ description: e.target.value })}
      />

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase text-slate-400">
            Assignee
          </label>
          <select
            className={inputClass}
            value={item.assigneeUserId ?? ""}
            onChange={(e) => {
              const userId = e.target.value || null;
              const label =
                assignableOptions.find((o) => o.userId === userId)?.label ??
                null;
              onChange({ assigneeUserId: userId, assigneeDisplayName: label });
            }}
          >
            <option value="">Unassigned</option>
            {assignableOptions.map((o) => (
              <option key={o.userId} value={o.userId}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase text-slate-400">
            Priority
          </label>
          <select
            className={inputClass}
            value={item.priority}
            onChange={(e) =>
              onChange({ priority: e.target.value as PlanPriority })
            }
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase text-slate-400">
            Duration (min)
          </label>
          <input
            type="number"
            min={0}
            className={inputClass}
            value={item.estimatedDurationMinutes}
            onChange={(e) =>
              onChange({
                estimatedDurationMinutes: Number(e.target.value) || 0,
              })
            }
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase text-slate-400">
            Start
          </label>
          <input
            type="datetime-local"
            className={inputClass}
            value={toDateTimeLocal(item.suggestedStart)}
            onChange={(e) =>
              onChange({
                suggestedStart: fromDateTimeLocal(e.target.value) ?? null,
              })
            }
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase text-slate-400">
            Due
          </label>
          <input
            type="datetime-local"
            className={inputClass}
            value={toDateTimeLocal(item.suggestedDue)}
            onChange={(e) =>
              onChange({
                suggestedDue: fromDateTimeLocal(e.target.value) ?? null,
              })
            }
          />
        </div>
        <label className="mt-5 flex items-center gap-2 text-xs text-[var(--bp-text)]">
          <input
            type="checkbox"
            checked={item.canRunInParallel}
            onChange={(e) => onChange({ canRunInParallel: e.target.checked })}
          />
          Can run in parallel
        </label>
      </div>

      {otherItems.length ? (
        <div className="mt-2">
          <label className="mb-1 block text-[10px] font-bold uppercase text-slate-400">
            Depends on
          </label>
          <div className="flex flex-wrap gap-2">
            {dependencyItems.map((dependency) => (
              <span
                key={dependency.proposalId}
                className="flex items-center gap-1 rounded-full border border-[var(--bp-accent)]/50 px-2 py-0.5 text-[11px] text-[var(--bp-text)]"
              >
                {dependency.title || "Untitled"}
                <button
                  type="button"
                  aria-label={`Remove dependency ${dependency.title}`}
                  onClick={() => toggleDependency(dependency.proposalId)}
                  className="font-black text-red-300"
                >
                  ×
                </button>
              </span>
            ))}
            {!dependencyItems.length ? (
              <span className="text-[11px] text-slate-500">None</span>
            ) : null}
          </div>
          {availableDependencies.length ? (
            <select
              aria-label="Add dependency"
              className={`${inputClass} mt-2`}
              value=""
              onChange={(event) =>
                event.target.value && toggleDependency(event.target.value)
              }
            >
              <option value="">Add dependency…</option>
              {availableDependencies.map((other) => (
                <option key={other.proposalId} value={other.proposalId}>
                  {other.title || "Untitled"}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      ) : null}

      {item.reason ? (
        <p className="mt-2 text-[11px] text-slate-400">Why: {item.reason}</p>
      ) : null}
      {item.warnings.length ? (
        <p className="mt-1 text-[11px] font-semibold text-amber-300">
          ⚠ {item.warnings.join(" ")}
        </p>
      ) : null}
      {item.assumptions.length ? (
        <p className="mt-1 text-[11px] text-slate-500">
          Assumption: {item.assumptions.join(" ")}
        </p>
      ) : null}
    </div>
  );
}
