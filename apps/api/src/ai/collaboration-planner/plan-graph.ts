// Deterministic graph algorithms for the AI Collaboration Planner: dependency
// sanitization/minimization, cycle-safe rebuild, and a resource-constrained
// scheduler. These run on EVERY generated proposal (AI or fallback) — they
// are what actually guarantee a valid, minimal, executable plan; the prompt
// only asks the model nicely, it can't enforce any of this.

import {
  derivePreparationSections,
  isFullScopeItem,
  itemSubjectKeys,
  studyCoversSection,
} from './collaboration-plan.types';
import type {
  ActivityType,
  CollaborationPlanItem,
  EligibleMember,
} from './collaboration-plan.types';

// Lower rank = earlier in the pipeline. A dependent item may only depend on
// items with a strictly lower rank — this is what "study should never depend
// on practice" etc. actually means mechanically.
export const ACTIVITY_PHASE_RANK: Record<ActivityType, number> = {
  preparation: 0,
  study_review: 1,
  shared_session: 1,
  practice: 2,
  error_analysis: 3,
  production: 4,
  other: 4,
};

export const ESSENTIAL_ACTIVITY_TYPES = new Set<ActivityType>([
  'preparation',
  'study_review',
  'practice',
  'error_analysis',
]);

// The strict phase-order rule only makes sense for the shared-outcome
// "learning pipeline" activity types. Ordinary divisible/production work
// (docs, screens, features — everything defaults to 'production' there)
// still needs ordinary peer-to-peer dependencies ("frontend" depends on
// "API contract"), which are same-rank and must NOT be stripped.
const PHASE_CONSTRAINED_TYPES = new Set<ActivityType>([
  'preparation',
  'study_review',
  'practice',
  'error_analysis',
  'shared_session',
]);

function violatesPhaseOrder(
  dependent: CollaborationPlanItem,
  dependency: CollaborationPlanItem,
): boolean {
  if (!PHASE_CONSTRAINED_TYPES.has(dependent.activityType)) return false;
  if (!PHASE_CONSTRAINED_TYPES.has(dependency.activityType)) return true;
  if (dependent.activityType === 'preparation') return true;
  const practiceLikeSession =
    Boolean(dependent.sharedSessionId) &&
    /\b(practice|test|exam|mock|quiz)\b/i.test(
      `${dependent.title} ${dependent.description}`,
    );
  if (practiceLikeSession) {
    return !['preparation', 'study_review', 'practice'].includes(
      dependency.activityType,
    );
  }
  if (
    dependent.sharedSessionId ||
    dependent.activityType === 'shared_session'
  ) {
    return !['preparation', 'study_review'].includes(dependency.activityType);
  }
  if (dependent.activityType === 'study_review') {
    return dependency.activityType !== 'preparation';
  }
  if (dependent.activityType === 'practice') {
    return !['study_review', 'shared_session'].includes(
      dependency.activityType,
    );
  }
  if (dependent.activityType === 'error_analysis') {
    return !['practice', 'shared_session'].includes(dependency.activityType);
  }
  return false;
}

/** DFS-based cycle detection; returns the set of proposalIds involved in any cycle. Shared by generate() and apply(). */
export function findCyclicNodes(adjacency: Map<string, string[]>): Set<string> {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  const cyclic = new Set<string>();
  const stack: string[] = [];

  for (const node of adjacency.keys()) color.set(node, WHITE);

  const visit = (node: string) => {
    color.set(node, GRAY);
    stack.push(node);
    for (const next of adjacency.get(node) ?? []) {
      const state = color.get(next);
      if (state === GRAY) {
        const idx = stack.indexOf(next);
        for (let i = idx; i < stack.length; i += 1) cyclic.add(stack[i]);
      } else if (state === WHITE) {
        visit(next);
      }
    }
    stack.pop();
    color.set(node, BLACK);
  };

  for (const node of adjacency.keys()) {
    if (color.get(node) === WHITE) visit(node);
  }
  return cyclic;
}

/**
 * Builds dependencies purely from activityType + ownership — never from
 * array order. Used as the deterministic rebuild target when the AI's
 * suggested dependencies contain a cycle (rare, but must never be returned
 * to the client), and is a reasonable coarse structure on its own: study
 * depends on teammates' preparation, practice depends on the assignee's own
 * study, error-analysis depends on the assignee's own practice.
 */
export function buildDeterministicDependencies(
  items: CollaborationPlanItem[],
): Map<string, string[]> {
  const deps = new Map<string, string[]>();

  for (const item of items) {
    const edges: string[] = [];

    if (item.activityType === 'study_review') {
      for (const other of items) {
        if (
          other.activityType === 'preparation' &&
          other.assigneeUserId !== item.assigneeUserId
        ) {
          edges.push(other.proposalId);
        }
      }
    } else if (item.activityType === 'shared_session') {
      for (const other of items) {
        if (
          other.activityType === 'study_review' &&
          other.assigneeUserId === item.assigneeUserId
        ) {
          edges.push(other.proposalId);
        }
      }
    } else if (item.activityType === 'practice') {
      for (const other of items) {
        if (
          other.activityType === 'study_review' &&
          other.assigneeUserId === item.assigneeUserId
        ) {
          edges.push(other.proposalId);
        }
      }
    } else if (item.activityType === 'error_analysis') {
      for (const other of items) {
        if (
          other.activityType === 'practice' &&
          other.assigneeUserId === item.assigneeUserId
        ) {
          edges.push(other.proposalId);
        }
      }
    }

    if (edges.length) deps.set(item.proposalId, [...new Set(edges)]);
  }
  return deps;
}

export type SanitizeResult = {
  items: CollaborationPlanItem[];
  cycleRepaired: boolean;
  removedSelfDeps: number;
  removedDangling: number;
  removedPhaseViolations: number;
  removedTransitiveRedundant: number;
};

/**
 * The single place that turns whatever dependency edges the AI (or our own
 * synthesis step) suggested into the smallest valid DAG:
 *  1. strip self-references, dangling references, and phase-order violations
 *     (a "study" can never depend on a "practice", etc. — see
 *     ACTIVITY_PHASE_RANK)
 *  2. if a cycle still exists (shouldn't, given #1, but the input is
 *     untrusted model output) discard ALL edges and rebuild deterministically
 *     rather than ever returning a cyclic plan
 *  3. apply transitive reduction — drop any direct edge that's already
 *     implied by another direct edge's own dependencies
 */
export function sanitizeAndMinimizeDependencies(
  items: CollaborationPlanItem[],
): SanitizeResult {
  const byId = new Map(items.map((item) => [item.proposalId, item]));
  const ids = new Set(byId.keys());

  let removedSelfDeps = 0;
  let removedDangling = 0;
  let removedPhaseViolations = 0;

  let working = items.map((item) => {
    const cleaned = (item.dependsOnProposalIds ?? []).filter((depId) => {
      if (depId === item.proposalId) {
        removedSelfDeps += 1;
        return false;
      }
      if (!ids.has(depId)) {
        removedDangling += 1;
        return false;
      }
      const dependency = byId.get(depId)!;
      if (
        item.sharedSessionId &&
        item.sharedSessionId === dependency.sharedSessionId
      ) {
        removedPhaseViolations += 1;
        return false;
      }
      if (violatesPhaseOrder(item, dependency)) {
        removedPhaseViolations += 1;
        return false;
      }
      return true;
    });
    return { ...item, dependsOnProposalIds: [...new Set(cleaned)] };
  });

  let cycleRepaired = false;
  const adjacency = new Map(
    working.map((item) => [item.proposalId, item.dependsOnProposalIds]),
  );
  const unitId = (item: CollaborationPlanItem) =>
    item.sharedSessionId
      ? `session:${item.sharedSessionId}`
      : `item:${item.proposalId}`;
  const collapsedAdjacency = new Map<string, string[]>();
  const workingByProposalId = new Map(
    working.map((item) => [item.proposalId, item]),
  );
  for (const item of working) {
    const node = unitId(item);
    const dependencies = new Set(collapsedAdjacency.get(node) ?? []);
    for (const dependencyId of item.dependsOnProposalIds) {
      const dependency = workingByProposalId.get(dependencyId);
      if (dependency && unitId(dependency) !== node)
        dependencies.add(unitId(dependency));
    }
    collapsedAdjacency.set(node, [...dependencies]);
  }
  for (const dependencies of collapsedAdjacency.values()) {
    for (const dependency of dependencies) {
      if (!collapsedAdjacency.has(dependency))
        collapsedAdjacency.set(dependency, []);
    }
  }
  if (
    findCyclicNodes(adjacency).size > 0 ||
    findCyclicNodes(collapsedAdjacency).size > 0
  ) {
    cycleRepaired = true;
    const rebuilt = buildDeterministicDependencies(working);
    working = working.map((item) => ({
      ...item,
      dependsOnProposalIds: rebuilt.get(item.proposalId) ?? [],
    }));
  }

  // Transitive reduction: compute full reachability against the (now
  // guaranteed-acyclic) graph once, then drop any direct edge that's also
  // reachable via another direct edge.
  const closureCache = new Map<string, Set<string>>();
  const workingById = new Map(working.map((item) => [item.proposalId, item]));
  function reachable(id: string): Set<string> {
    const cached = closureCache.get(id);
    if (cached) return cached;
    const result = new Set<string>();
    closureCache.set(id, result);
    const self = workingById.get(id);
    for (const depId of self?.dependsOnProposalIds ?? []) {
      result.add(depId);
      for (const transitive of reachable(depId)) result.add(transitive);
    }
    return result;
  }

  let removedTransitiveRedundant = 0;
  working = working.map((item) => {
    const direct = item.dependsOnProposalIds;
    // Keep explicit links from error analysis to personal practice and
    // shared-test attendance even when one is transitively implied by the
    // other; both relationships are pedagogically meaningful in the UI.
    if (item.activityType === 'error_analysis') return item;
    if (direct.length < 2) return item;
    const minimal = direct.filter((depId) => {
      const impliedElsewhere = direct.some(
        (other) => other !== depId && reachable(other).has(depId),
      );
      if (impliedElsewhere) removedTransitiveRedundant += 1;
      return !impliedElsewhere;
    });
    return minimal.length === direct.length
      ? item
      : { ...item, dependsOnProposalIds: minimal };
  });

  return {
    items: working,
    cycleRepaired,
    removedSelfDeps,
    removedDangling,
    removedPhaseViolations,
    removedTransitiveRedundant,
  };
}

// --- Scheduling --------------------------------------------------------------

export type ScheduleContext = {
  now: Date;
  taskDueDate: Date | null;
  recoveryMode: boolean;
};

export type ScheduleResult = {
  items: CollaborationPlanItem[];
  deadlineFeasible: boolean;
  overflowMinutes: number;
};

/**
 * Deterministic list-scheduler over the (already acyclic, minimal) DAG:
 * each participant is a resource with capacity 1 — an item can't start until
 * every dependency has finished AND its assignee is free — which is what
 * makes overlaps structurally impossible rather than merely "detected", and
 * what lets independent branches (different assignees, no shared
 * dependency) start at the same time rather than waiting on each other.
 * Members of the same shared_session are scheduled as one synchronized unit.
 * In recovery mode, ties are broken in favor of the core learning pipeline
 * (preparation/study/practice/error-analysis) over production/polish items.
 */
export function scheduleItems(
  items: CollaborationPlanItem[],
  context: ScheduleContext,
): ScheduleResult {
  const byId = new Map(items.map((item) => [item.proposalId, item]));
  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const item of items) {
    indegree.set(item.proposalId, (item.dependsOnProposalIds ?? []).length);
    for (const depId of item.dependsOnProposalIds ?? []) {
      const list = dependents.get(depId) ?? [];
      list.push(item.proposalId);
      dependents.set(depId, list);
    }
  }

  const originalIndex = new Map(
    items.map((item, index) => [item.proposalId, index]),
  );
  function priorityKey(id: string): [number, number, number] {
    const item = byId.get(id)!;
    const essential = context.recoveryMode
      ? ESSENTIAL_ACTIVITY_TYPES.has(item.activityType)
        ? 0
        : 1
      : 0;
    return [
      essential,
      ACTIVITY_PHASE_RANK[item.activityType],
      originalIndex.get(id) ?? 0,
    ];
  }

  const ready: string[] = items
    .filter((item) => (indegree.get(item.proposalId) ?? 0) === 0)
    .map((item) => item.proposalId);
  const finish = new Map<string, Date>();
  const scheduledStart = new Map<string, Date>();
  const assigneeCursor = new Map<string, Date>();
  const finalized = new Set<string>();

  function popNext(): string | undefined {
    if (!ready.length) return undefined;
    ready.sort((a, b) => {
      const pa = priorityKey(a);
      const pb = priorityKey(b);
      for (let i = 0; i < pa.length; i += 1)
        if (pa[i] !== pb[i]) return pa[i] - pb[i];
      return 0;
    });
    const index = ready.findIndex((id) => {
      const item = byId.get(id)!;
      if (!item.sharedSessionId) return true;
      return items
        .filter((member) => member.sharedSessionId === item.sharedSessionId)
        .every((member) => (indegree.get(member.proposalId) ?? 0) === 0);
    });
    return index < 0 ? undefined : ready.splice(index, 1)[0];
  }

  function depFinishTime(item: CollaborationPlanItem): Date {
    return (item.dependsOnProposalIds ?? []).reduce((latest, depId) => {
      const depFinish = finish.get(depId);
      return depFinish && depFinish > latest ? depFinish : latest;
    }, context.now);
  }

  function propagate(id: string) {
    for (const dependentId of dependents.get(id) ?? []) {
      const remaining = (indegree.get(dependentId) ?? 0) - 1;
      indegree.set(dependentId, remaining);
      if (remaining === 0) ready.push(dependentId);
    }
  }

  let processed = 0;
  while (processed < items.length) {
    const id = popNext();
    if (!id) break; // defensive: shouldn't happen on an acyclic graph
    if (finalized.has(id)) {
      processed += 1;
      continue;
    }
    const item = byId.get(id)!;

    if (item.sharedSessionId) {
      const group = items.filter(
        (member) => member.sharedSessionId === item.sharedSessionId,
      );
      const groupIds = new Set(group.map((member) => member.proposalId));
      for (let index = ready.length - 1; index >= 0; index -= 1) {
        if (groupIds.has(ready[index])) ready.splice(index, 1);
      }
      const groupStart = group.reduce((latest, member) => {
        const depFinish = depFinishTime(member);
        const cursor = member.assigneeUserId
          ? (assigneeCursor.get(member.assigneeUserId) ?? context.now)
          : context.now;
        const candidate = depFinish > cursor ? depFinish : cursor;
        return candidate > latest ? candidate : latest;
      }, context.now);
      const groupDurationMs =
        Math.max(...group.map((member) => member.estimatedDurationMinutes)) *
        60_000;
      const groupFinish = new Date(groupStart.getTime() + groupDurationMs);
      for (const member of group) {
        finish.set(member.proposalId, groupFinish);
        scheduledStart.set(member.proposalId, groupStart);
        if (member.assigneeUserId)
          assigneeCursor.set(member.assigneeUserId, groupFinish);
        finalized.add(member.proposalId);
        propagate(member.proposalId);
      }
      processed += group.length;
    } else {
      const depFinish = depFinishTime(item);
      const cursor = item.assigneeUserId
        ? (assigneeCursor.get(item.assigneeUserId) ?? context.now)
        : context.now;
      const start = depFinish > cursor ? depFinish : cursor;
      const itemFinish = new Date(
        start.getTime() + item.estimatedDurationMinutes * 60_000,
      );
      finish.set(item.proposalId, itemFinish);
      scheduledStart.set(item.proposalId, start);
      if (item.assigneeUserId)
        assigneeCursor.set(item.assigneeUserId, itemFinish);
      finalized.add(item.proposalId);
      propagate(item.proposalId);
      processed += 1;
    }
  }

  let overflowMinutes = 0;
  const scheduled = items.map((item) => {
    const start = scheduledStart.get(item.proposalId) ?? context.now;
    const end = finish.get(item.proposalId) ?? start;
    if (context.taskDueDate && end.getTime() > context.taskDueDate.getTime()) {
      overflowMinutes = Math.max(
        overflowMinutes,
        Math.round((end.getTime() - context.taskDueDate.getTime()) / 60_000),
      );
    }
    return {
      ...item,
      suggestedStart: start.toISOString(),
      suggestedDue: end.toISOString(),
    };
  });

  return {
    items: scheduled,
    deadlineFeasible: !context.taskDueDate || overflowMinutes === 0,
    overflowMinutes,
  };
}

// --- Workload rebalancing ----------------------------------------------------

const FLEXIBLE_ACTIVITY_TYPES = new Set<ActivityType>([
  'preparation',
  'production',
]);
const MIN_FLEXIBLE_ITEM_MINUTES = 15;
const REBALANCE_STEP_MINUTES = 10;
const MAX_REBALANCE_ITERATIONS = 200;
const BALANCE_TOLERANCE_RATIO = 0.05;

export type RebalanceResult = {
  items: CollaborationPlanItem[];
  balanced: boolean;
  reason: string | null;
};

export function validateSharedOutcomeSemantics(
  items: CollaborationPlanItem[],
  requiredParticipantIds: string[],
): string[] {
  const errors: string[] = [];
  const byId = new Map(items.map((item) => [item.proposalId, item]));
  const sections = derivePreparationSections(items);
  const requiredSubjects = new Set(
    sections
      .map((section) => section.key)
      .filter((key) => key.startsWith('subject:')),
  );

  for (const participantId of requiredParticipantIds) {
    const studies = items.filter(
      (item) =>
        item.assigneeUserId === participantId &&
        item.activityType === 'study_review' &&
        !item.sharedSessionId,
    );
    for (const section of sections) {
      if (!studies.some((study) => studyCoversSection(study, section))) {
        errors.push(
          `${participantId} lacks personal study coverage for ${section.label}.`,
        );
      }
    }
    if (!sections.length && !studies.length) {
      errors.push(`${participantId} lacks personal full-scope study coverage.`);
    }

    const practices = items.filter(
      (item) =>
        item.assigneeUserId === participantId &&
        item.activityType === 'practice' &&
        !item.sharedSessionId,
    );
    if (!practices.length)
      errors.push(`${participantId} lacks individual practice coverage.`);
    const coveredSubjects = new Set(
      practices.flatMap((item) => itemSubjectKeys(item)),
    );
    if (
      requiredSubjects.size &&
      !practices.some((item) => isFullScopeItem(item)) &&
      [...requiredSubjects].some((key) => !coveredSubjects.has(key))
    ) {
      errors.push(
        `${participantId} lacks personal practice coverage for every subject.`,
      );
    }
    for (const practice of practices) {
      const practiceSubjects = new Set(itemSubjectKeys(practice));
      const dependencies = practice.dependsOnProposalIds
        .map((id) => byId.get(id))
        .filter((item): item is CollaborationPlanItem => Boolean(item));
      if (isFullScopeItem(practice) || !practiceSubjects.size) {
        if (
          studies.some(
            (study) =>
              !practice.dependsOnProposalIds.includes(study.proposalId),
          )
        ) {
          errors.push(
            `${practice.proposalId} does not follow all personal study coverage.`,
          );
        }
      } else {
        for (const subject of practiceSubjects) {
          if (
            !dependencies.some((dependency) =>
              itemSubjectKeys(dependency).includes(subject),
            )
          ) {
            errors.push(
              `${practice.proposalId} lacks its matching study prerequisite for ${subject}.`,
            );
          }
        }
        if (
          dependencies.some(
            (dependency) =>
              dependency.activityType === 'study_review' &&
              itemSubjectKeys(dependency).length > 0 &&
              !itemSubjectKeys(dependency).some((key) =>
                practiceSubjects.has(key),
              ),
          )
        ) {
          errors.push(
            `${practice.proposalId} depends on study for a different subject.`,
          );
        }
      }
    }

    const ownPracticeIds = new Set(practices.map((item) => item.proposalId));
    for (const session of items.filter(
      (item) =>
        item.assigneeUserId === participantId &&
        Boolean(item.sharedSessionId) &&
        /\b(practice|test|exam|mock|quiz)\b/i.test(
          `${item.title} ${item.description}`,
        ),
    )) {
      ownPracticeIds.add(session.proposalId);
    }
    const errorItems = items.filter(
      (item) =>
        item.assigneeUserId === participantId &&
        item.activityType === 'error_analysis',
    );
    if (!errorItems.length)
      errors.push(`${participantId} lacks error-analysis coverage.`);
    for (const errorItem of errorItems) {
      if (
        [...ownPracticeIds].some(
          (id) => !errorItem.dependsOnProposalIds.includes(id),
        )
      ) {
        errors.push(
          `${errorItem.proposalId} does not follow the participant's practice.`,
        );
      }
    }
  }

  for (const sessionId of new Set(
    items.map((item) => item.sharedSessionId).filter(Boolean),
  )) {
    const group = items.filter((item) => item.sharedSessionId === sessionId);
    const template = group[0];
    const dependencies = template.dependsOnProposalIds
      .map((id) => byId.get(id))
      .filter(Boolean) as CollaborationPlanItem[];
    const sessionSubjects = new Set(itemSubjectKeys(template));
    const practiceLike = /\b(practice|test|exam|mock|quiz)\b/i.test(
      `${template.title} ${template.description}`,
    );
    if (practiceLike) {
      const personalPracticeIds = items
        .filter(
          (item) => item.activityType === 'practice' && !item.sharedSessionId,
        )
        .map((item) => item.proposalId);
      if (
        personalPracticeIds.some(
          (id) => !template.dependsOnProposalIds.includes(id),
        )
      ) {
        errors.push(
          `Shared mock session ${String(sessionId)} can start before personal practice is complete.`,
        );
      }
    } else if (sessionSubjects.size) {
      if (
        dependencies.some(
          (dependency) =>
            !itemSubjectKeys(dependency).some((key) =>
              sessionSubjects.has(key),
            ),
        )
      ) {
        errors.push(
          `Shared review ${String(sessionId)} depends on a different subject.`,
        );
      }
      for (const subject of sessionSubjects) {
        if (
          !dependencies.some((dependency) =>
            itemSubjectKeys(dependency).includes(subject),
          )
        ) {
          errors.push(
            `Shared review ${String(sessionId)} lacks study prerequisite for ${subject}.`,
          );
        }
      }
    }
  }

  const preparations = items.filter(
    (item) => item.activityType === 'preparation',
  );
  for (const finalItem of items.filter((item) =>
    /\b(final\s+cross[- ]check|resource\s+consolidation|final\s+consolidation)\b/i.test(
      `${item.title} ${item.description}`,
    ),
  )) {
    if (
      preparations.some(
        (prep) => !finalItem.dependsOnProposalIds.includes(prep.proposalId),
      )
    ) {
      errors.push(
        `${finalItem.proposalId} does not depend on every artifact it validates.`,
      );
    }
  }

  return [...new Set(errors)];
}

export function buildSharedOutcomeSummary(
  items: CollaborationPlanItem[],
  requiredParticipantIds: string[],
): string {
  const errors = validateSharedOutcomeSemantics(items, requiredParticipantIds);
  return errors.length
    ? `Collaborative study plan generated with unresolved coverage warnings: ${errors.join(' ')}`
    : 'Validated collaborative study plan with explicit per-participant, per-subject study coverage, personal practice coverage, subject-aligned dependencies, and correctly sequenced error analysis.';
}

export function validateFinalPlan(
  items: CollaborationPlanItem[],
  requiredParticipantIds: string[] = [],
): string[] {
  const errors: string[] = [];
  const byId = new Map(items.map((item) => [item.proposalId, item]));
  if (byId.size !== items.length) errors.push('Proposal IDs are not unique.');

  const adjacency = new Map<string, string[]>();
  for (const item of items) {
    const deps = item.dependsOnProposalIds ?? [];
    adjacency.set(item.proposalId, deps);
    if (deps.includes(item.proposalId))
      errors.push(`${item.proposalId} depends on itself.`);
    for (const depId of deps) {
      const dependency = byId.get(depId);
      if (!dependency) {
        errors.push(`${item.proposalId} has dangling dependency ${depId}.`);
        continue;
      }
      if (violatesPhaseOrder(item, dependency)) {
        errors.push(
          `${item.proposalId} has a backward phase dependency on ${depId}.`,
        );
      }
      if (
        item.sharedSessionId &&
        item.sharedSessionId === dependency.sharedSessionId
      ) {
        errors.push(
          `Shared-session attendee ${item.proposalId} depends on peer ${depId}.`,
        );
      }
      if (item.suggestedStart && dependency.suggestedDue) {
        if (
          new Date(item.suggestedStart).getTime() <
          new Date(dependency.suggestedDue).getTime()
        ) {
          errors.push(
            `${item.proposalId} starts before dependency ${depId} ends.`,
          );
        }
      }
    }
  }
  if (findCyclicNodes(adjacency).size)
    errors.push('Dependency graph contains a cycle.');

  const sessions = new Map<string, CollaborationPlanItem[]>();
  for (const item of items) {
    if (!item.sharedSessionId) continue;
    const group = sessions.get(item.sharedSessionId) ?? [];
    group.push(item);
    sessions.set(item.sharedSessionId, group);
  }
  for (const [sessionId, group] of sessions) {
    const starts = new Set(group.map((item) => item.suggestedStart));
    const ends = new Set(group.map((item) => item.suggestedDue));
    const prerequisiteSets = new Set(
      group.map((item) =>
        JSON.stringify([...new Set(item.dependsOnProposalIds)].sort()),
      ),
    );
    if (starts.size !== 1 || ends.size !== 1)
      errors.push(`Shared session ${sessionId} is not synchronized.`);
    if (prerequisiteSets.size !== 1)
      errors.push(
        `Shared session ${sessionId} attendees do not have identical prerequisites.`,
      );
  }

  if (requiredParticipantIds.length) {
    errors.push(
      ...validateSharedOutcomeSemantics(items, requiredParticipantIds),
    );
  }

  return [...new Set(errors)];
}

/**
 * Shrinks the heaviest participant's flexible (preparation/production) items
 * toward the average until every participant is within 5% of it. Never
 * touches study/practice/error-analysis/shared-session items — those are
 * individually-owned learning time by design and must stay symmetric, not be
 * "balanced away". If flexible time runs out before reaching 5%, explains
 * exactly why instead of silently claiming balance.
 */
export function rebalanceWorkload(
  items: CollaborationPlanItem[],
  requiredParticipantIds: string[],
  eligibleMembers: Map<string, EligibleMember>,
): RebalanceResult {
  if (requiredParticipantIds.length < 2)
    return { items, balanced: true, reason: null };

  let working = items.map((item) => ({ ...item }));

  function totals(): Map<string, number> {
    const map = new Map(requiredParticipantIds.map((id) => [id, 0]));
    for (const item of working) {
      if (item.assigneeUserId && map.has(item.assigneeUserId)) {
        map.set(
          item.assigneeUserId,
          (map.get(item.assigneeUserId) ?? 0) + item.estimatedDurationMinutes,
        );
      }
    }
    return map;
  }

  let balanced = false;
  let reason: string | null = null;

  for (
    let iteration = 0;
    iteration < MAX_REBALANCE_ITERATIONS;
    iteration += 1
  ) {
    const totalMap = totals();
    const values = [...totalMap.values()];
    const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
    const max = Math.max(...values);
    const min = Math.min(...values);

    if (avg === 0 || max - min <= avg * BALANCE_TOLERANCE_RATIO) {
      balanced = true;
      break;
    }

    const [heaviestId] = [...totalMap.entries()].sort((a, b) => b[1] - a[1])[0];
    const flexItem = working
      .filter(
        (item) =>
          item.assigneeUserId === heaviestId &&
          FLEXIBLE_ACTIVITY_TYPES.has(item.activityType) &&
          item.estimatedDurationMinutes > MIN_FLEXIBLE_ITEM_MINUTES,
      )
      .sort(
        (a, b) => b.estimatedDurationMinutes - a.estimatedDurationMinutes,
      )[0];

    if (!flexItem) {
      const name =
        eligibleMembers.get(heaviestId)?.displayName ?? 'A participant';
      reason =
        `Could not fully balance workload — ${name}'s remaining time is individual full-scope study/practice/` +
        'error-analysis work that must stay with them, not divisible content production that can be shifted.';
      break;
    }

    const reducible = Math.min(
      REBALANCE_STEP_MINUTES,
      flexItem.estimatedDurationMinutes - MIN_FLEXIBLE_ITEM_MINUTES,
      Math.ceil((max - min) / 2),
    );
    if (reducible <= 0) {
      reason =
        'Could not fully balance workload within the available flexible (preparation/production) items.';
      break;
    }
    working = working.map((item) =>
      item.proposalId === flexItem.proposalId
        ? {
            ...item,
            estimatedDurationMinutes: item.estimatedDurationMinutes - reducible,
          }
        : item,
    );
  }

  return { items: working, balanced, reason: balanced ? null : reason };
}
