// Response shape + normalization for the AI Collaboration Planner
// (POST /tasks/:taskId/ai/collaboration-plan). Mirrors the pattern in
// task-plan.ts: the model returns loosely-shaped JSON and
// normalizeCollaborationPlanResponse coerces it into the strict contract the
// frontend relies on. The proposal is never persisted — the client echoes the
// (possibly edited) items back to the apply endpoint, which revalidates
// everything server-side before writing anything.

export const PLAN_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type PlanPriority = (typeof PLAN_PRIORITIES)[number];

// 'shared_outcome': every assigned participant must ultimately learn/cover
// the full scope (exam prep, studying a course, interview prep, joint
// revision, certification training) — work may be divided for preparation
// efficiency, but the *learning outcome* may not be divided.
// 'divisible': ordinary project work where a subtask genuinely belongs to
// one owner (docs, screens, features, independent reports).
export const COLLABORATION_TASK_TYPES = [
  'shared_outcome',
  'divisible',
] as const;
export type CollaborationTaskType = (typeof COLLABORATION_TASK_TYPES)[number];

export const ACTIVITY_TYPES = [
  'preparation', // creating a study resource (summary, slide deck, question bank, ...)
  'study_review', // studying and/or reviewing material — may be one's own prep or a teammate's
  'practice', // solving practice questions/exercises covering the full scope
  'error_analysis', // reviewing mistakes from practice and revising weak areas
  'shared_session', // a synchronous joint session (e.g. a live review call) — full duration counts for every attendee
  'production', // ordinary divisible-task output (a doc, a screen, a feature) — default for non-study tasks
  'other',
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export type CollaborationPlanItem = {
  proposalId: string;
  title: string;
  description: string;
  assigneeUserId: string | null;
  assigneeDisplayName: string | null;
  estimatedDurationMinutes: number;
  suggestedStart: string | null;
  suggestedDue: string | null;
  priority: PlanPriority;
  order: number;
  dependsOnProposalIds: string[];
  canRunInParallel: boolean;
  reason: string;
  assumptions: string[];
  warnings: string[];
  activityType: ActivityType;
  // Links items that represent the SAME synchronous session across multiple
  // attendees (e.g. a joint review call) — every item sharing this id must
  // carry the session's full duration, never a split fraction of it.
  sharedSessionId: string | null;
};

export type MemberWorkload = {
  userId: string;
  displayName: string;
  itemCount: number;
  totalEstimatedMinutes: number;
};

export type CollaborationPlanProposal = {
  planId: string;
  generatedAt: string;
  source: 'ai' | 'fallback';
  taskCollaborationType: CollaborationTaskType;
  recoveryMode: boolean;
  summary: string;
  items: CollaborationPlanItem[];
  workloadByMember: MemberWorkload[];
  totalEstimatedMinutes: number;
  deadlineFeasible: boolean;
  risks: string[];
  unassignedWork: string[];
  reviewMilestone: { title: string; suggestedDate: string | null } | null;
  suggestedBufferMinutes: number | null;
  warnings: string[];
  assumptions: string[];
};

export type EligibleMember = { userId: string; displayName: string };

const TITLE_MAX = 255;
const DESCRIPTION_MAX = 2000;
const REASON_MAX = 500;
const MAX_ITEMS = 40;
const MAX_LIST_ITEMS = 15;
const DURATION_BOUNDS = { min: 5, max: 2880 } as const; // 5 min .. 48h

// --- Task-type classification -----------------------------------------------

// Deliberately conservative regexes (word-boundary, specific phrases) so an
// ordinary project task whose description happens to mention "review" isn't
// misclassified — "study"/"exam"/"revision"/"certification" etc. are strong,
// low-false-positive signals for "everyone must learn the full scope".
const SHARED_OUTCOME_PATTERNS: RegExp[] = [
  /\bexams?\b/,
  /\bmidterms?\b/,
  /\bfinal\s+exams?\b/,
  /\bquiz(zes)?\b/,
  /\bstudy(ing)?\b/,
  /\brevis(e|ion|ing)\b/,
  /\binterview\s+prep(aration)?\b/,
  /\bcertification\b/,
  /\btraining\s+for\b/,
  /\bsyllabus\b/,
  /\bcoursework\b/,
  /\blearn(ing)?\s+(the\s+)?(course|material|content|subject)\b/,
];

/**
 * Classifies whether a task's collaboration should follow the "shared
 * outcome" model (learning responsibility can't be divided) or the ordinary
 * "divisible" model. An explicit owner override always wins; otherwise this
 * is a keyword heuristic over title/description/category — imperfect by
 * nature, which is why the owner can override it via preferences.taskType.
 */
export function classifyCollaborationTaskType(
  task: { title: string; description: string | null; category: string | null },
  override?: 'auto' | CollaborationTaskType,
): CollaborationTaskType {
  if (override === 'shared_outcome' || override === 'divisible')
    return override;
  const haystack =
    `${task.title} ${task.description ?? ''} ${task.category ?? ''}`.toLowerCase();
  return SHARED_OUTCOME_PATTERNS.some((pattern) => pattern.test(haystack))
    ? 'shared_outcome'
    : 'divisible';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown, max = TITLE_MAX): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function readStringArray(
  value: unknown,
  maxItems: number,
  maxLen: number,
): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => readString(item, maxLen))
    .filter(Boolean)
    .slice(0, maxItems);
}

function readPriority(value: unknown): PlanPriority {
  return (PLAN_PRIORITIES as readonly string[]).includes(value as string)
    ? (value as PlanPriority)
    : 'medium';
}

function readActivityType(
  value: unknown,
  fallback: ActivityType,
): ActivityType {
  return (ACTIVITY_TYPES as readonly string[]).includes(value as string)
    ? (value as ActivityType)
    : fallback;
}

function readIsoDate(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function readMinutes(value: unknown, fallback = 60): number {
  const num =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : NaN;
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.max(
    DURATION_BOUNDS.min,
    Math.min(DURATION_BOUNDS.max, Math.round(num)),
  );
}

function reconcileDescriptionDuration(
  description: string,
  estimatedDurationMinutes: number,
): { minutes: number; warning: string | null } {
  const matches = [
    ...description.matchAll(/\b(\d{1,4})\s*(?:min(?:ute)?s?)\b/gi),
  ];
  if (matches.length < 2)
    return { minutes: estimatedDurationMinutes, warning: null };
  const describedTotal = matches.reduce(
    (sum, match) => sum + Number(match[1]),
    0,
  );
  if (
    !Number.isFinite(describedTotal) ||
    describedTotal < DURATION_BOUNDS.min ||
    describedTotal > DURATION_BOUNDS.max ||
    describedTotal === estimatedDurationMinutes
  ) {
    return { minutes: estimatedDurationMinutes, warning: null };
  }
  return {
    minutes: describedTotal,
    warning: `Duration corrected from ${estimatedDurationMinutes} to ${describedTotal} minutes to match the explicit breakdown in the description.`,
  };
}

/**
 * Normalizes the raw AI JSON into a strict proposal. `eligibleAssigneeIds` is
 * the exact set the owner selected (+ the owner id, if they opted to include
 * themselves) — any assignee the model names outside this set is dropped to
 * `null` with a warning rather than trusted, since assigning work to someone
 * who wasn't selected is a hard rule violation.
 */
export function normalizeCollaborationPlanResponse(
  raw: unknown,
  context: {
    planId: string;
    now: Date;
    eligibleMembers: Map<string, EligibleMember>;
    taskCollaborationType: CollaborationTaskType;
  },
): CollaborationPlanProposal {
  const record = asRecord(raw);
  const summary = readString(record.summary, 1000);
  const defaultActivityType: ActivityType =
    context.taskCollaborationType === 'shared_outcome' ? 'other' : 'production';

  const rawItems = Array.isArray(record.items) ? record.items : [];
  const usedProposalIds = new Set<string>();

  type Draft = CollaborationPlanItem & { __order: number };
  const drafts: Draft[] = [];

  rawItems.slice(0, MAX_ITEMS).forEach((rawItem, index) => {
    const item = asRecord(rawItem);
    const title = readString(item.title);
    if (!title) return;

    let proposalId = readString(item.proposalId, 64) || `item-${index + 1}`;
    while (usedProposalIds.has(proposalId)) {
      proposalId = `${proposalId}-${index + 1}`;
    }
    usedProposalIds.add(proposalId);

    const warnings = readStringArray(item.warnings, MAX_LIST_ITEMS, 300);
    const description = readString(item.description, DESCRIPTION_MAX);
    const duration = reconcileDescriptionDuration(
      description,
      readMinutes(item.estimatedDurationMinutes),
    );
    if (duration.warning) warnings.push(duration.warning);
    let assigneeUserId: string | null = null;
    let assigneeDisplayName: string | null = null;
    const rawAssigneeId = readString(item.assigneeUserId, 64);
    if (rawAssigneeId && context.eligibleMembers.has(rawAssigneeId)) {
      assigneeUserId = rawAssigneeId;
      assigneeDisplayName =
        context.eligibleMembers.get(rawAssigneeId)!.displayName;
    } else if (rawAssigneeId) {
      warnings.push(
        'Suggested assignee was not in the selected team — left unassigned.',
      );
    }

    drafts.push({
      __order: index,
      proposalId,
      title,
      description,
      assigneeUserId,
      assigneeDisplayName,
      estimatedDurationMinutes: duration.minutes,
      suggestedStart: readIsoDate(item.suggestedStart),
      suggestedDue: readIsoDate(item.suggestedDue),
      priority: readPriority(item.priority),
      order: typeof item.order === 'number' ? item.order : index + 1,
      dependsOnProposalIds: readStringArray(item.dependsOnProposalIds, 10, 64),
      canRunInParallel: item.canRunInParallel === true,
      reason: readString(item.reason, REASON_MAX),
      assumptions: readStringArray(item.assumptions, MAX_LIST_ITEMS, 300),
      warnings,
      activityType: readActivityType(item.activityType, defaultActivityType),
      sharedSessionId: readString(item.sharedSessionId, 64) || null,
    });
  });

  // Only drop self-references and dangling references here — phase-order
  // correctness, cycle-safety, and transitive-reduction minimization are the
  // dependency graph builder's job (plan-graph.ts's sanitizeAndMinimizeDependencies,
  // always run by the service before a proposal is returned), not this
  // shape-coercion layer.
  const validIds = new Set(drafts.map((draft) => draft.proposalId));
  const items: CollaborationPlanItem[] = drafts.map((draft) => {
    const dependsOnProposalIds = [
      ...new Set(
        draft.dependsOnProposalIds.filter(
          (id) => id !== draft.proposalId && validIds.has(id),
        ),
      ),
    ];
    const { __order, ...rest } = draft;
    void __order;
    return { ...rest, dependsOnProposalIds };
  });

  const workloadByMember = computeWorkload(items, context.eligibleMembers);
  const totalEstimatedMinutes = items.reduce(
    (sum, item) => sum + item.estimatedDurationMinutes,
    0,
  );

  const reviewMilestoneRecord = asRecord(record.reviewMilestone);
  const reviewMilestoneTitle = readString(
    reviewMilestoneRecord.title,
    TITLE_MAX,
  );

  return {
    planId: context.planId,
    generatedAt: context.now.toISOString(),
    source: 'ai',
    taskCollaborationType: context.taskCollaborationType,
    recoveryMode: false,
    summary: summary || 'AI-generated collaboration plan.',
    items,
    workloadByMember,
    totalEstimatedMinutes,
    deadlineFeasible: record.deadlineFeasible !== false,
    risks: readStringArray(record.risks, MAX_LIST_ITEMS, 300),
    unassignedWork: readStringArray(record.unassignedWork, MAX_LIST_ITEMS, 300),
    reviewMilestone: reviewMilestoneTitle
      ? {
          title: reviewMilestoneTitle,
          suggestedDate: readIsoDate(reviewMilestoneRecord.suggestedDate),
        }
      : null,
    suggestedBufferMinutes:
      typeof record.suggestedBufferMinutes === 'number' &&
      record.suggestedBufferMinutes >= 0
        ? Math.round(record.suggestedBufferMinutes)
        : null,
    warnings: readStringArray(record.warnings, MAX_LIST_ITEMS, 300),
    assumptions: readStringArray(record.assumptions, MAX_LIST_ITEMS, 300),
  };
}

export function computeWorkload(
  items: CollaborationPlanItem[],
  eligibleMembers: Map<string, EligibleMember>,
): MemberWorkload[] {
  const byMember = new Map<string, MemberWorkload>();
  for (const item of items) {
    if (!item.assigneeUserId) continue;
    const existing = byMember.get(item.assigneeUserId);
    const displayName =
      eligibleMembers.get(item.assigneeUserId)?.displayName ??
      item.assigneeDisplayName ??
      'Unknown';
    if (existing) {
      existing.itemCount += 1;
      existing.totalEstimatedMinutes += item.estimatedDurationMinutes;
    } else {
      byMember.set(item.assigneeUserId, {
        userId: item.assigneeUserId,
        displayName,
        itemCount: 1,
        totalEstimatedMinutes: item.estimatedDurationMinutes,
      });
    }
  }
  return [...byMember.values()].sort(
    (a, b) => b.totalEstimatedMinutes - a.totalEstimatedMinutes,
  );
}

// --- Shared-outcome deterministic enforcement -------------------------------

let coverageIdCounter = 0;
function nextSynthProposalId(kind: string, userId: string): string {
  coverageIdCounter += 1;
  return `synth-${kind}-${userId.slice(0, 8)}-${coverageIdCounter}`;
}

export type PreparationSection = {
  key: string;
  label: string;
  preparationIds: string[];
};

export function subjectKeys(text: string): string[] {
  const keys = new Set<string>();
  const segments = text.matchAll(
    /subjects?\s*((?:\d+\s*(?:(?:,|&|and|[-–—])\s*)?)+)/gi,
  );
  for (const match of segments) {
    const segment = match[1];
    for (const range of segment.matchAll(/(\d+)\s*[-–—]\s*(\d+)/g)) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (
        Number.isInteger(start) &&
        Number.isInteger(end) &&
        end >= start &&
        end - start <= 20
      ) {
        for (let value = start; value <= end; value += 1)
          keys.add(`subject:${value}`);
      }
    }
    const withoutRanges = segment.replace(/\d+\s*[-–—]\s*\d+/g, '');
    for (const number of withoutRanges.matchAll(/\d+/g))
      keys.add(`subject:${Number(number[0])}`);
  }
  return [...keys];
}

export function itemSubjectKeys(item: CollaborationPlanItem): string[] {
  return subjectKeys(`${item.title} ${item.description}`);
}

export function isFullScopeItem(item: {
  title: string;
  description: string;
}): boolean {
  return /\b(full[- ]scope|all\s+(?:required\s+)?subjects?|complete\s+(?:scope|syllabus|material))\b/i.test(
    `${item.title} ${item.description}`,
  );
}

export function derivePreparationSections(
  items: CollaborationPlanItem[],
): PreparationSection[] {
  const preparations = items.filter(
    (item) => item.activityType === 'preparation',
  );
  const explicitSubjects = new Set(
    items.flatMap((item) => itemSubjectKeys(item)),
  );
  if (explicitSubjects.size) {
    return [...explicitSubjects].map((key) => ({
      key,
      label: `Subject ${key.slice('subject:'.length)}`,
      preparationIds: preparations
        .filter((prep) => itemSubjectKeys(prep).includes(key))
        .map((prep) => prep.proposalId),
    }));
  }
  return preparations.map((prep) => ({
    key: `prep:${prep.proposalId}`,
    label: prep.title,
    preparationIds: [prep.proposalId],
  }));
}

export function studyCoversSection(
  item: CollaborationPlanItem,
  section: PreparationSection,
): boolean {
  if (section.key.startsWith('subject:')) {
    return itemSubjectKeys(item).includes(section.key);
  }
  return section.preparationIds.some((id) =>
    item.dependsOnProposalIds.includes(id),
  );
}

/**
 * Deterministically enforces the "shared outcome" collaboration rule after
 * normalization: preparation work may be divided, but every required
 * participant must end up with their own full-scope study/review, practice,
 * and error-analysis coverage. Also equalizes shared-session durations so a
 * joint session counts its full length for every attendee, never a split
 * fraction. Mutates nothing — returns a new proposal.
 */
export function enforceSharedOutcomeCoverage(
  proposal: CollaborationPlanProposal,
  context: {
    requiredParticipantIds: string[];
    eligibleMembers: Map<string, EligibleMember>;
    existingTitles: Set<string>;
    now: Date;
    defaultStudyMinutes: number;
    defaultPracticeMinutes: number;
    defaultErrorAnalysisMinutes: number;
  },
): CollaborationPlanProposal {
  if (
    proposal.taskCollaborationType !== 'shared_outcome' ||
    !context.requiredParticipantIds.length
  ) {
    return proposal;
  }

  let items = [...proposal.items];
  const warnings = [...proposal.warnings];
  const assumptions = [...proposal.assumptions];

  // A synchronous session is represented by one item per attendee. Treat a
  // single unassigned model item as a template and synthesize stable-ID
  // attendee copies before dependency repair and scheduling.
  const inferredSessionIds = new Map<string, string>();
  items = items.map((item) => {
    if (item.activityType !== 'shared_session' || item.sharedSessionId)
      return item;
    const key = item.title.trim().toLowerCase();
    let sessionId = inferredSessionIds.get(key);
    if (!sessionId) {
      sessionId = nextSynthProposalId('session', 'shared');
      inferredSessionIds.set(key, sessionId);
    }
    return { ...item, sharedSessionId: sessionId };
  });
  const initialSessionIds = [
    ...new Set(items.map((item) => item.sharedSessionId).filter(Boolean)),
  ] as string[];
  for (const sessionId of initialSessionIds) {
    const group = items.filter((item) => item.sharedSessionId === sessionId);
    const template = group[0];
    const represented = new Set(
      group.map((item) => item.assigneeUserId).filter(Boolean),
    );
    items = items.filter(
      (item) => !(item.sharedSessionId === sessionId && !item.assigneeUserId),
    );
    for (const participantId of context.requiredParticipantIds) {
      if (represented.has(participantId)) continue;
      const member = context.eligibleMembers.get(participantId);
      if (!member) continue;
      // Every attendee copy keeps the same clean title — assignment is
      // structural (assigneeUserId), never encoded in the title. These are
      // collapsed back into one shared subtask at apply time.
      items.push({
        ...template,
        proposalId: nextSynthProposalId('attendee', participantId),
        title: template.title,
        assigneeUserId: participantId,
        assigneeDisplayName: member.displayName,
        sharedSessionId: sessionId,
      });
    }
  }

  const invalidUnassignedLearningIds = new Set(
    items
      .filter(
        (item) =>
          !item.assigneeUserId &&
          ['study_review', 'practice', 'error_analysis'].includes(
            item.activityType,
          ),
      )
      .map((item) => item.proposalId),
  );
  if (invalidUnassignedLearningIds.size) {
    items = items
      .filter((item) => !invalidUnassignedLearningIds.has(item.proposalId))
      .map((item) => ({
        ...item,
        dependsOnProposalIds: item.dependsOnProposalIds.filter(
          (id) => !invalidUnassignedLearningIds.has(id),
        ),
      }));
    warnings.push(
      `Removed ${invalidUnassignedLearningIds.size} unassigned personal learning item(s); personal study, practice, and error analysis require an assignee.`,
    );
  }

  // 1. Equalize shared-session durations: every item sharing a sharedSessionId
  // represents the SAME synchronous session — the full duration counts for
  // every attendee, never a split fraction.
  const sessionGroups = new Map<string, CollaborationPlanItem[]>();
  for (const item of items) {
    if (!item.sharedSessionId) continue;
    const group = sessionGroups.get(item.sharedSessionId) ?? [];
    group.push(item);
    sessionGroups.set(item.sharedSessionId, group);
  }
  let sessionsCorrected = 0;
  for (const group of sessionGroups.values()) {
    const maxMinutes = Math.max(
      ...group.map((item) => item.estimatedDurationMinutes),
    );
    if (group.some((item) => item.estimatedDurationMinutes !== maxMinutes)) {
      sessionsCorrected += 1;
      const groupIds = new Set(group.map((item) => item.proposalId));
      items = items.map((item) =>
        groupIds.has(item.proposalId)
          ? { ...item, estimatedDurationMinutes: maxMinutes }
          : item,
      );
    }
  }
  if (sessionsCorrected > 0) {
    warnings.push(
      `Corrected ${sessionsCorrected} shared session${sessionsCorrected === 1 ? '' : 's'} where the duration was ` +
        'split across attendees instead of counting in full for each participant.',
    );
  }

  // 2. Per-participant full-scope coverage: study/review, practice, and
  // error-analysis are each required individually — preparing material for
  // others (activityType 'preparation'/'production') never satisfies them.
  // Study coverage is split PER teammate-prepared resource (not one combined
  // blob) so a participant can start studying/practicing a section as soon
  // as that section is ready, instead of waiting on everything at once.
  const preparationSections = derivePreparationSections(items);

  for (const participantId of context.requiredParticipantIds) {
    const member = context.eligibleMembers.get(participantId);
    if (!member) continue;

    const own = () =>
      items.filter((item) => item.assigneeUserId === participantId);

    let addedStudyItems = 0;
    for (const section of preparationSections) {
      const existingStudy = own().find(
        (item) =>
          item.activityType === 'study_review' &&
          !item.sharedSessionId &&
          studyCoversSection(item, section),
      );
      if (existingStudy) {
        const requiredDeps = new Set([
          ...existingStudy.dependsOnProposalIds,
          ...section.preparationIds,
        ]);
        items = items.map((item) =>
          item.proposalId === existingStudy.proposalId
            ? { ...item, dependsOnProposalIds: [...requiredDeps] }
            : item,
        );
        continue;
      }
      const title = `Study ${section.label}`;
      const studyItem: CollaborationPlanItem = {
        proposalId: nextSynthProposalId('study', participantId),
        title,
        description: `Study and review ${section.label} individually; preparing a section does not count as studying it.`,
        assigneeUserId: participantId,
        assigneeDisplayName: member.displayName,
        estimatedDurationMinutes: context.defaultStudyMinutes,
        suggestedStart: null,
        suggestedDue: null,
        priority: 'high',
        order: (items[items.length - 1]?.order ?? items.length) + 1,
        dependsOnProposalIds: section.preparationIds,
        canRunInParallel: true,
        reason:
          'Auto-added: full scope must be studied individually, split by prepared section so it can start as ' +
          'soon as that section is ready.',
        assumptions: [],
        warnings: [],
        activityType: 'study_review',
        sharedSessionId: null,
      };
      items = [...items, studyItem];
      addedStudyItems += 1;
    }
    if (addedStudyItems > 0) {
      assumptions.push(
        `Auto-added ${addedStudyItems} full-scope study item(s) for ${member.displayName} (missing from the AI response).`,
      );
    }

    // No preparation phase to hook into at all (AI skipped it entirely) —
    // still guarantee at least one full-scope study item.
    if (
      !preparationSections.length &&
      !own().some((item) => item.activityType === 'study_review')
    ) {
      const title = 'Study and review full scope';
      items = [
        ...items,
        {
          proposalId: nextSynthProposalId('study', participantId),
          title,
          description: 'Study and review the complete scope individually.',
          assigneeUserId: participantId,
          assigneeDisplayName: member.displayName,
          estimatedDurationMinutes: context.defaultStudyMinutes,
          suggestedStart: null,
          suggestedDue: null,
          priority: 'high',
          order: (items[items.length - 1]?.order ?? items.length) + 1,
          dependsOnProposalIds: [],
          canRunInParallel: true,
          reason:
            'Auto-added: every participant must cover the full scope individually.',
          assumptions: [],
          warnings: [],
          activityType: 'study_review',
          sharedSessionId: null,
        },
      ];
      assumptions.push(
        `Auto-added full-scope study coverage for ${member.displayName} (missing from the AI response).`,
      );
    }

    const finalStudyItems = own().filter(
      (item) => item.activityType === 'study_review' && !item.sharedSessionId,
    );
    let practiceItems = own().filter(
      (item) => item.activityType === 'practice' && !item.sharedSessionId,
    );
    const requiredSubjectKeys = new Set(
      preparationSections
        .map((section) => section.key)
        .filter((key) => key.startsWith('subject:')),
    );

    // Repair existing personal practice by subject identity. A subject-
    // specific practice depends only on this participant's study for that
    // subject; an explicit full-scope practice depends on all personal study.
    items = items.map((item) => {
      if (
        !practiceItems.some(
          (practice) => practice.proposalId === item.proposalId,
        )
      )
        return item;
      const practiceSubjects = new Set(itemSubjectKeys(item));
      const matchingStudies = finalStudyItems.filter((study) => {
        if (isFullScopeItem(item) || !practiceSubjects.size) return true;
        return itemSubjectKeys(study).some((key) => practiceSubjects.has(key));
      });
      return {
        ...item,
        dependsOnProposalIds: matchingStudies.map((study) => study.proposalId),
      };
    });
    practiceItems = own().filter(
      (item) => item.activityType === 'practice' && !item.sharedSessionId,
    );
    const coveredPracticeSubjects = new Set(
      practiceItems.flatMap((item) => itemSubjectKeys(item)),
    );
    const hasFullScopePractice = practiceItems.some((item) =>
      isFullScopeItem(item),
    );
    const practiceCoverageComplete =
      hasFullScopePractice ||
      (requiredSubjectKeys.size > 0 &&
        [...requiredSubjectKeys].every((key) =>
          coveredPracticeSubjects.has(key),
        ));

    if (!practiceItems.length || !practiceCoverageComplete) {
      const title = 'Full-scope practice test';
      const practiceItem: CollaborationPlanItem = {
        proposalId: nextSynthProposalId('practice', participantId),
        title,
        description:
          'Complete practice questions/exercises covering the full scope, independently.',
        assigneeUserId: participantId,
        assigneeDisplayName: member.displayName,
        estimatedDurationMinutes: context.defaultPracticeMinutes,
        suggestedStart: null,
        suggestedDue: null,
        priority: 'high',
        order: (items[items.length - 1]?.order ?? items.length) + 1,
        dependsOnProposalIds: finalStudyItems.map((item) => item.proposalId),
        canRunInParallel: true,
        reason:
          'Auto-added: individual full-scope practice is required and must not be skipped.',
        assumptions: [],
        warnings: [],
        activityType: 'practice',
        sharedSessionId: null,
      };
      items = [...items, practiceItem];
      practiceItems = [...practiceItems, practiceItem];
      assumptions.push(
        `Auto-added full-scope practice coverage for ${member.displayName} (missing from the AI response).`,
      );
    }

    const practiceSessionItems = own().filter(
      (item) =>
        Boolean(item.sharedSessionId) &&
        ['shared_session', 'practice'].includes(item.activityType) &&
        /\b(practice|test|exam|mock|quiz)\b/i.test(
          `${item.title} ${item.description}`,
        ),
    );
    const practiceIds = new Set(
      [...practiceItems, ...practiceSessionItems].map(
        (item) => item.proposalId,
      ),
    );

    let errorItems = own().filter(
      (item) => item.activityType === 'error_analysis',
    );
    if (!errorItems.length) {
      const title = 'Analyze mistakes and revise weak areas';
      const errorItem: CollaborationPlanItem = {
        proposalId: nextSynthProposalId('erroranalysis', participantId),
        title,
        description:
          "Review this participant's own practice mistakes and revise the identified weak areas.",
        assigneeUserId: participantId,
        assigneeDisplayName: member.displayName,
        estimatedDurationMinutes: context.defaultErrorAnalysisMinutes,
        suggestedStart: null,
        suggestedDue: null,
        priority: 'high',
        order: (items[items.length - 1]?.order ?? items.length) + 1,
        dependsOnProposalIds: [...practiceIds],
        canRunInParallel: true,
        reason:
          "Auto-added: personal error analysis must not be skipped or merged into someone else's task.",
        assumptions: [],
        warnings: [],
        activityType: 'error_analysis',
        sharedSessionId: null,
      };
      items = [...items, errorItem];
      errorItems = [errorItem];
      assumptions.push(
        `Auto-added error-analysis coverage for ${member.displayName} (missing from the AI response).`,
      );
    }

    // Error analysis always follows this participant's own practice. Replace
    // model edges rather than merging them, so stale/future dependencies can
    // never survive into the final graph.
    const errorIds = new Set(errorItems.map((item) => item.proposalId));
    items = items.map((item) =>
      errorIds.has(item.proposalId)
        ? { ...item, dependsOnProposalIds: [...practiceIds] }
        : item,
    );
  }

  // Every attendee in one synchronized session exposes the same semantic
  // prerequisites. Shared reviews follow study of their own subjects; mock
  // exams follow personal practice and never replace it.
  for (const sessionId of new Set(
    items.map((item) => item.sharedSessionId).filter(Boolean),
  )) {
    const group = items.filter((item) => item.sharedSessionId === sessionId);
    const template = group[0];
    const sessionSubjects = new Set(itemSubjectKeys(template));
    const practiceLike = /\b(practice|test|exam|mock|quiz)\b/i.test(
      `${template.title} ${template.description}`,
    );
    const candidates = practiceLike
      ? items.filter(
          (candidate) =>
            candidate.activityType === 'practice' && !candidate.sharedSessionId,
        )
      : items.filter(
          (candidate) =>
            candidate.activityType === 'study_review' &&
            !candidate.sharedSessionId,
        );
    const prerequisites = candidates
      .filter((candidate) => {
        if (!sessionSubjects.size || isFullScopeItem(template)) return true;
        if (isFullScopeItem(candidate)) return true;
        return itemSubjectKeys(candidate).some((key) =>
          sessionSubjects.has(key),
        );
      })
      .map((candidate) => candidate.proposalId);
    items = items.map((item) =>
      item.sharedSessionId === sessionId
        ? { ...item, dependsOnProposalIds: prerequisites }
        : item,
    );
  }

  const finalArtifactPattern =
    /\b(final\s+cross[- ]check|resource\s+consolidation|final\s+consolidation)\b/i;
  const optionalFinalIds = new Set(
    items
      .filter((item) =>
        finalArtifactPattern.test(`${item.title} ${item.description}`),
      )
      .map((item) => item.proposalId),
  );
  if (proposal.recoveryMode && optionalFinalIds.size) {
    items = items
      .filter((item) => !optionalFinalIds.has(item.proposalId))
      .map((item) => ({
        ...item,
        dependsOnProposalIds: item.dependsOnProposalIds.filter(
          (id) => !optionalFinalIds.has(id),
        ),
      }));
  } else if (optionalFinalIds.size) {
    const artifactIds = items
      .filter((item) => item.activityType === 'preparation')
      .map((item) => item.proposalId);
    items = items.map((item) =>
      optionalFinalIds.has(item.proposalId)
        ? { ...item, dependsOnProposalIds: artifactIds }
        : item,
    );
  }

  return {
    ...proposal,
    items,
    workloadByMember: computeWorkload(items, context.eligibleMembers),
    totalEstimatedMinutes: items.reduce(
      (sum, item) => sum + item.estimatedDurationMinutes,
      0,
    ),
    warnings,
    assumptions,
  };
}

/**
 * Deterministic fallback used when the AI provider is unavailable or returns
 * unusable JSON — mirrors AiPlannerService's AI-first/fallback split.
 *
 * For ordinary divisible tasks this is a naive equal split (one flat item per
 * eligible member). For shared-outcome tasks (exam prep, studying, etc.) a
 * naive split would violate the core rule — instead this builds the minimal
 * correct phase structure generically for any number of participants: split
 * preparation round-robin, require every participant to study the FULL
 * combined material, then give each their own practice + error-analysis item.
 */
export function buildFallbackProposal(context: {
  planId: string;
  now: Date;
  taskTitle: string;
  totalEstimateMinutes: number;
  eligibleMembers: Map<string, EligibleMember>;
  memberOrder: string[];
  taskCollaborationType: CollaborationTaskType;
  recoveryMode: boolean;
}): CollaborationPlanProposal {
  const memberIds = context.memberOrder.length
    ? context.memberOrder
    : [...context.eligibleMembers.keys()];

  if (context.taskCollaborationType === 'shared_outcome' && memberIds.length) {
    return buildSharedOutcomeFallback(context, memberIds);
  }

  const perPersonMinutes = memberIds.length
    ? Math.max(
        30,
        Math.round(context.totalEstimateMinutes / memberIds.length) || 60,
      )
    : 60;

  const items: CollaborationPlanItem[] = memberIds.map((userId, index) => {
    const member = context.eligibleMembers.get(userId);
    return {
      proposalId: `fallback-${index + 1}`,
      title: `${context.taskTitle} — part ${index + 1}`,
      description:
        'Placeholder split generated without AI assistance. Edit the title, scope, and dates before applying.',
      assigneeUserId: userId,
      assigneeDisplayName: member?.displayName ?? null,
      estimatedDurationMinutes: perPersonMinutes,
      suggestedStart: null,
      suggestedDue: null,
      priority: 'medium',
      order: index + 1,
      dependsOnProposalIds: [],
      canRunInParallel: true,
      reason:
        'Equal split across selected team members (AI assistant unavailable).',
      assumptions: [
        'No AI-derived breakdown was available; this is an equal, generic split.',
      ],
      warnings: [],
      activityType: 'production',
      sharedSessionId: null,
    };
  });

  return {
    planId: context.planId,
    generatedAt: context.now.toISOString(),
    source: 'fallback',
    taskCollaborationType: context.taskCollaborationType,
    recoveryMode: context.recoveryMode,
    summary:
      'AI planning is currently unavailable. Here is a simple equal split you can edit before applying.',
    items,
    workloadByMember: computeWorkload(items, context.eligibleMembers),
    totalEstimatedMinutes: items.reduce(
      (sum, item) => sum + item.estimatedDurationMinutes,
      0,
    ),
    deadlineFeasible: !context.recoveryMode,
    risks: [],
    unassignedWork: [],
    reviewMilestone: null,
    suggestedBufferMinutes: null,
    warnings: [
      'Generated without AI assistance — review carefully before applying.',
      ...(context.recoveryMode
        ? [
            'The task due date has already passed — dates below are placeholders; reschedule before applying.',
          ]
        : []),
    ],
    assumptions: [
      'Equal split by member count; no role, availability, or dependency reasoning applied.',
    ],
  };
}

function buildSharedOutcomeFallback(
  context: {
    planId: string;
    now: Date;
    taskTitle: string;
    totalEstimateMinutes: number;
    eligibleMembers: Map<string, EligibleMember>;
    recoveryMode: boolean;
  },
  memberIds: string[],
): CollaborationPlanProposal {
  const items: CollaborationPlanItem[] = [];
  let order = 1;

  // Phase 1: split preparation round-robin, one chunk per participant.
  const prepItems: CollaborationPlanItem[] = memberIds.map((userId, index) => {
    const member = context.eligibleMembers.get(userId);
    const item: CollaborationPlanItem = {
      proposalId: `fallback-prep-${index + 1}`,
      title: `Prepare summary for section ${index + 1}`,
      description:
        'Prepare a study summary for this section of the material. Edit the scope before applying.',
      assigneeUserId: userId,
      assigneeDisplayName: member?.displayName ?? null,
      estimatedDurationMinutes: 90,
      suggestedStart: null,
      suggestedDue: null,
      priority: 'medium',
      order: order++,
      dependsOnProposalIds: [],
      canRunInParallel: true,
      reason:
        'Preparation work may be divided across the team (AI assistant unavailable — generic split).',
      assumptions: [
        'No AI-derived syllabus breakdown was available; sections are placeholders — edit before applying.',
      ],
      warnings: [],
      activityType: 'preparation',
      sharedSessionId: null,
    };
    items.push(item);
    return item;
  });

  // Phase 2/3: every participant studies each teammate-prepared section
  // individually — split per section (not one combined blob) so studying a
  // section can start as soon as that section's preparation is done — then
  // completes independent full-scope practice.
  const studyItemsByParticipant = new Map<string, CollaborationPlanItem[]>();
  for (const userId of memberIds) {
    const member = context.eligibleMembers.get(userId);
    const ownStudyItems: CollaborationPlanItem[] = [];
    for (const prep of prepItems.filter((p) => p.assigneeUserId !== userId)) {
      const item: CollaborationPlanItem = {
        proposalId: nextSynthProposalId('fallback-study', userId),
        title: `Study ${prep.title.replace(/^Prepare summary for /i, '')}`,
        description: `Study and review "${prep.title}", prepared by a teammate.`,
        assigneeUserId: userId,
        assigneeDisplayName: member?.displayName ?? null,
        estimatedDurationMinutes: 60,
        suggestedStart: null,
        suggestedDue: null,
        priority: 'high',
        order: order++,
        dependsOnProposalIds: [prep.proposalId],
        canRunInParallel: true,
        reason:
          'Every participant must study each prepared section individually — split so it can start as soon as ' +
          'that section is ready.',
        assumptions: [],
        warnings: [],
        activityType: 'study_review',
        sharedSessionId: null,
      };
      items.push(item);
      ownStudyItems.push(item);
    }
    studyItemsByParticipant.set(userId, ownStudyItems);
  }

  const practiceItems: CollaborationPlanItem[] = memberIds.map((userId) => {
    const member = context.eligibleMembers.get(userId);
    const item: CollaborationPlanItem = {
      proposalId: nextSynthProposalId('fallback-practice', userId),
      title: 'Full-scope practice test',
      description:
        'Complete practice questions covering the full scope, independently.',
      assigneeUserId: userId,
      assigneeDisplayName: member?.displayName ?? null,
      estimatedDurationMinutes: 60,
      suggestedStart: null,
      suggestedDue: null,
      priority: 'high',
      order: order++,
      dependsOnProposalIds: (studyItemsByParticipant.get(userId) ?? []).map(
        (item) => item.proposalId,
      ),
      canRunInParallel: true,
      reason:
        'Independent full-scope practice, required for every participant.',
      assumptions: [],
      warnings: [],
      activityType: 'practice',
      sharedSessionId: null,
    };
    items.push(item);
    return item;
  });

  // Phase 5: individual error analysis.
  memberIds.forEach((userId, index) => {
    const member = context.eligibleMembers.get(userId);
    items.push({
      proposalId: nextSynthProposalId('fallback-error', userId),
      title: 'Analyze mistakes and revise weak areas',
      description:
        "Review this participant's own practice mistakes and revise the identified weak areas.",
      assigneeUserId: userId,
      assigneeDisplayName: member?.displayName ?? null,
      estimatedDurationMinutes: 30,
      suggestedStart: null,
      suggestedDue: null,
      priority: 'high',
      order: order++,
      dependsOnProposalIds: [practiceItems[index].proposalId],
      canRunInParallel: true,
      reason: 'Personal error analysis is required individually.',
      assumptions: [],
      warnings: [],
      activityType: 'error_analysis',
      sharedSessionId: null,
    });
  });

  return {
    planId: context.planId,
    generatedAt: context.now.toISOString(),
    source: 'fallback',
    taskCollaborationType: 'shared_outcome',
    recoveryMode: context.recoveryMode,
    summary:
      'AI planning is currently unavailable. This is a generic shared-study split: preparation is divided, but ' +
      'every participant still has their own full-scope study, practice, and error-analysis tasks — edit the ' +
      'section scope and dates before applying.',
    items,
    workloadByMember: computeWorkload(items, context.eligibleMembers),
    totalEstimatedMinutes: items.reduce(
      (sum, item) => sum + item.estimatedDurationMinutes,
      0,
    ),
    deadlineFeasible: !context.recoveryMode,
    risks: [],
    unassignedWork: [],
    reviewMilestone: null,
    suggestedBufferMinutes: null,
    warnings: [
      'Generated without AI assistance — review carefully before applying.',
      ...(context.recoveryMode
        ? [
            'The task due date has already passed — this fallback still preserves full-scope study, practice, and ' +
              'error-analysis coverage for every participant; reschedule dates before applying.',
          ]
        : []),
    ],
    assumptions: [
      'This is a generic shared-study structure (no AI reasoning about actual syllabus content); adjust section ' +
        'scope, titles, and dates before applying.',
    ],
  };
}
