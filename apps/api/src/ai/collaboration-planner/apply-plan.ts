// Pure planning logic for POST .../ai/collaboration-plan/apply — separated
// from the DB-touching service the same way plan-graph.ts separates the pure
// graph algorithms used by generate(). Nothing here talks to the database;
// ai-collaboration-planner.service.ts maps DTO input to ApplyCandidate,
// calls buildApplyPlan(), then persists the result.

import { InternalServerErrorException } from '@nestjs/common';
import { isFullScopeItem, subjectKeys } from './collaboration-plan.types';
import type { ActivityType } from './collaboration-plan.types';
import { findCyclicNodes } from './plan-graph';

// Subtasks created by this endpoint are tagged with this source so a later
// apply can find and replace its own prior output instead of appending
// duplicates, while never touching manually-created subtasks (source null).
export const AI_COLLABORATION_PLANNER_SOURCE = 'ai-collaboration-planner';

// Activity types for which an unassigned, non-shared-session item is a stale
// generic placeholder once a participant-specific item of the same type
// survives — mirrors the exact rule collaboration-plan.types.ts already
// enforces for shared_outcome proposals at generate time
// (`invalidUnassignedLearningIds`), reused here at apply time regardless of
// task type since a client could resubmit an old generic item either way.
const GENERIC_PLACEHOLDER_TYPES = new Set<ActivityType>([
  'study_review',
  'practice',
  'error_analysis',
]);

export type ApplyCandidate = {
  proposalId: string;
  title: string;
  description: string;
  assigneeUserId: string | null;
  activityType: ActivityType;
  sharedSessionId: string | null;
  dependsOnProposalIds: string[];
  // Set by the shared-session collapse step: a genuinely shared subtask
  // persisted once with no single assignee (isShared true, assigneeUserId
  // null). Individually-owned work stays false.
  isShared: boolean;
};

/**
 * Strips a leading `Name:` assignee prefix a client might resubmit from a
 * legacy plan (e.g. "hadeel: Study Subject 1" -> "Study Subject 1").
 * Assignment is structural (assigneeUserId) — names never belong in titles.
 *
 * Precise, not heuristic: only strips when the prefix exactly matches a known
 * participant display name, so real structural titles ("Chapter 3: …",
 * "Week 2: …") are never touched. With no known names it only trims.
 */
export function stripAssigneePrefix(
  title: string,
  knownNames?: Set<string>,
): string {
  const trimmed = title.trim();
  if (!knownNames || !knownNames.size) return trimmed;
  const match = trimmed.match(/^([^:]{1,60}):\s*(.+\S)\s*$/);
  if (!match) return trimmed;
  if (knownNames.has(match[1].trim().toLowerCase())) return match[2].trim();
  return trimmed;
}

export type ApplyItemError = { proposalId: string; error: string };

export type BuildApplyPlanResult = {
  keepItems: ApplyCandidate[];
  itemErrors: ApplyItemError[];
};

/**
 * Semantic identity: participant + learning stage + scope + shared-session
 * grouping. Two items with the same key occupy the same slot in the plan.
 * Different *stages* (preparation vs study vs practice vs error analysis)
 * always get different keys since activityType is part of the key — only
 * items within the same stage, for the same participant, can collide.
 *
 * Scope is NOT just sorted subjectKeys: isFullScopeItem() is checked first so
 * "Subject 1 practice" and "full-scope practice" never collide on identity
 * even when the full-scope item's text also happens to mention "Subject 1".
 */
export function computeSemanticKey(item: {
  assigneeUserId: string | null;
  activityType: ActivityType;
  title: string;
  description: string;
  sharedSessionId: string | null;
}): string {
  const scope = isFullScopeItem(item)
    ? 'full-scope'
    : subjectKeys(`${item.title} ${item.description}`).sort().join(',');
  return [
    item.assigneeUserId ?? 'unassigned',
    item.activityType,
    scope,
    item.sharedSessionId ?? '',
  ].join('|');
}

function validateApplyInvariants(items: ApplyCandidate[]) {
  const errors: string[] = [];
  const byId = new Map(items.map((item) => [item.proposalId, item]));
  const seenIds = new Set<string>();
  const seenKeys = new Set<string>();

  for (const item of items) {
    if (seenIds.has(item.proposalId)) {
      errors.push(`Duplicate proposalId ${item.proposalId} survived dedup.`);
    }
    seenIds.add(item.proposalId);

    const key = computeSemanticKey(item);
    if (seenKeys.has(key)) {
      errors.push(`Duplicate semantic key survived dedup for ${item.proposalId}.`);
    }
    seenKeys.add(key);

    if (item.dependsOnProposalIds.includes(item.proposalId)) {
      errors.push(`${item.proposalId} depends on itself.`);
    }
    for (const depId of item.dependsOnProposalIds) {
      if (!byId.has(depId)) {
        errors.push(`${item.proposalId} has dangling dependency ${depId}.`);
      }
    }

    if (
      !item.assigneeUserId &&
      !item.sharedSessionId &&
      GENERIC_PLACEHOLDER_TYPES.has(item.activityType) &&
      items.some(
        (other) =>
          other.assigneeUserId && other.activityType === item.activityType,
      )
    ) {
      errors.push(
        `${item.proposalId} is an unassigned generic placeholder alongside a participant-specific equivalent.`,
      );
    }
  }

  const adjacency = new Map(
    items.map((item) => [item.proposalId, item.dependsOnProposalIds]),
  );
  if (findCyclicNodes(adjacency).size) {
    errors.push('Dependency graph contains a cycle.');
  }

  if (errors.length) {
    throw new InternalServerErrorException(
      `Apply plan failed deterministic invariant validation: ${errors.join(' ')}`,
    );
  }
}

/**
 * Turns the client-submitted, already cycle-checked candidate list into the
 * final set to persist:
 *  0. shared-session collapse — every item sharing a sharedSessionId is
 *     genuinely the SAME shared work, so the group is collapsed into ONE
 *     shared subtask (isShared true, assigneeUserId null) rather than one
 *     duplicate per participant. Dependency edges pointing at any collapsed
 *     attendee are redirected to the single surviving shared item.
 *  1. semantic dedup — first occurrence per key wins; later ones are
 *     rejected (reported in itemErrors) and any dependency edge pointing at
 *     a rejected item is redirected to the surviving canonical item instead
 *     of silently dropped.
 *  2. generic-placeholder removal — an unassigned, non-shared-session
 *     study/practice/error-analysis item is dropped once a
 *     participant-specific item of the same activity type survives (a real
 *     shared session is never touched: it always carries sharedSessionId).
 *  3. dependency re-filter against the surviving ID set (no canonical target
 *     for a removed generic placeholder, so those edges are just dropped).
 *  4. defensive cycle-breaking in case remapping onto a canonical item
 *     introduced a cycle that didn't exist in the original submission.
 *  5. invariant validation — throws rather than ever persisting a broken
 *     plan.
 */
export function buildApplyPlan(
  candidates: ApplyCandidate[],
): BuildApplyPlanResult {
  const itemErrors: ApplyItemError[] = [];
  const supersededBy = new Map<string, string>();

  // Step 0: collapse each shared-session group into one shared subtask.
  const collapsed: ApplyCandidate[] = [];
  const sharedGroups = new Map<string, ApplyCandidate[]>();
  for (const item of candidates) {
    if (item.sharedSessionId) {
      const group = sharedGroups.get(item.sharedSessionId) ?? [];
      group.push(item);
      sharedGroups.set(item.sharedSessionId, group);
    } else {
      collapsed.push({ ...item, isShared: false });
    }
  }
  for (const group of sharedGroups.values()) {
    const template = group[0];
    const unionDeps = new Set<string>();
    for (const member of group) {
      for (const depId of member.dependsOnProposalIds) unionDeps.add(depId);
      if (member.proposalId !== template.proposalId) {
        supersededBy.set(member.proposalId, template.proposalId);
      }
    }
    collapsed.push({
      ...template,
      assigneeUserId: null,
      isShared: true,
      dependsOnProposalIds: [...unionDeps],
    });
  }

  const canonicalByKey = new Map<string, string>();
  const afterDedup: ApplyCandidate[] = [];
  for (const item of collapsed) {
    const key = computeSemanticKey(item);
    const canonicalId = canonicalByKey.get(key);
    if (canonicalId) {
      supersededBy.set(item.proposalId, canonicalId);
      itemErrors.push({
        proposalId: item.proposalId,
        error:
          'Duplicate semantic identity — another item already covers this participant/stage/subject.',
      });
      continue;
    }
    canonicalByKey.set(key, item.proposalId);
    afterDedup.push(item);
  }

  const remapDependency = (id: string): string => {
    let current = id;
    const seen = new Set<string>();
    while (supersededBy.has(current) && !seen.has(current)) {
      seen.add(current);
      current = supersededBy.get(current)!;
    }
    return current;
  };
  let working = afterDedup.map((item) => ({
    ...item,
    dependsOnProposalIds: [
      ...new Set(item.dependsOnProposalIds.map(remapDependency)),
    ].filter((id) => id !== item.proposalId),
  }));

  const assignedTypes = new Set(
    working
      .filter((item) => item.assigneeUserId)
      .map((item) => item.activityType),
  );
  working = working.filter((item) => {
    const isGenericPlaceholder =
      !item.assigneeUserId &&
      !item.sharedSessionId &&
      GENERIC_PLACEHOLDER_TYPES.has(item.activityType) &&
      assignedTypes.has(item.activityType);
    if (isGenericPlaceholder) {
      itemErrors.push({
        proposalId: item.proposalId,
        error:
          'Generic unassigned item removed — a participant-specific equivalent already covers this stage.',
      });
      return false;
    }
    return true;
  });

  const keepIds = new Set(working.map((item) => item.proposalId));
  working = working.map((item) => ({
    ...item,
    dependsOnProposalIds: item.dependsOnProposalIds.filter((id) =>
      keepIds.has(id),
    ),
  }));

  const adjacency = new Map(
    working.map((item) => [item.proposalId, item.dependsOnProposalIds]),
  );
  const cyclic = findCyclicNodes(adjacency);
  if (cyclic.size) {
    working = working.map((item) =>
      cyclic.has(item.proposalId)
        ? {
            ...item,
            dependsOnProposalIds: item.dependsOnProposalIds.filter(
              (id) => !cyclic.has(id),
            ),
          }
        : item,
    );
  }

  validateApplyInvariants(working);

  return { keepItems: working, itemErrors };
}
