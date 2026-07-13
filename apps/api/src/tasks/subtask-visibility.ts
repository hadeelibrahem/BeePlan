// Pure, role-aware subtask visibility rules — the single source of truth for
// "which subtasks may this viewer see / modify?", enforced server-side so the
// client can never reveal restricted data. Kept dependency-free so it is
// trivially unit-testable and reusable from both the task read path
// (tasks.service.ts) and the write guard.

export const SUBTASK_VIEWS = [
  'all',
  'mine',
  'shared',
  'unassigned',
  'member',
] as const;
export type SubtaskView = (typeof SUBTASK_VIEWS)[number];

export type ViewerRole = 'owner' | 'editor' | 'viewer';

// The minimal shape the rules need — any row/entity carrying these fields works.
export type VisibilitySubtask = {
  assigneeUserId?: string | null;
  isShared?: boolean | null;
};

export type ViewerContext = {
  userId: string;
  role: ViewerRole;
  view?: SubtaskView;
  assigneeId?: string | null;
};

/**
 * Base visibility rule (the security boundary). Owner and viewer see every
 * subtask (viewer is read-only but full-visibility). An editor sees only their
 * own personal work, shared work, and the unassigned team backlog — never
 * another member's personal subtask.
 */
export function isSubtaskVisibleToViewer(
  subtask: VisibilitySubtask,
  viewer: { userId: string; role: ViewerRole },
): boolean {
  if (viewer.role === 'owner' || viewer.role === 'viewer') return true;
  return (
    subtask.assigneeUserId === viewer.userId ||
    subtask.isShared === true ||
    subtask.assigneeUserId == null
  );
}

/**
 * True when a subtask matches the optional refinement view. Applied only on
 * top of the base rule (see filterVisibleSubtasks) — it can narrow what a
 * viewer sees but never widen it.
 */
export function matchesSubtaskView(
  subtask: VisibilitySubtask,
  view: SubtaskView | undefined,
  viewer: { userId: string; assigneeId?: string | null },
): boolean {
  switch (view) {
    case 'mine':
      return subtask.assigneeUserId === viewer.userId;
    case 'shared':
      return subtask.isShared === true;
    case 'unassigned':
      return subtask.isShared !== true && subtask.assigneeUserId == null;
    case 'member':
      // A member filter with no target selects nothing (avoids silently
      // falling back to "everyone").
      return (
        viewer.assigneeId != null &&
        subtask.assigneeUserId === viewer.assigneeId
      );
    case 'all':
    case undefined:
    default:
      return true;
  }
}

/**
 * Returns the subtasks a viewer is allowed to see, after applying the base
 * role rule and then the optional refinement view. The refinement is ANDed
 * after the base rule, so an editor requesting `view: 'member'` for another
 * user (or `view: 'all'`) can never escalate past their base visibility.
 */
export function filterVisibleSubtasks<T extends VisibilitySubtask>(
  subtasks: T[],
  viewer: ViewerContext,
): T[] {
  return subtasks.filter(
    (subtask) =>
      isSubtaskVisibleToViewer(subtask, viewer) &&
      matchesSubtaskView(subtask, viewer.view, viewer),
  );
}

/**
 * Write authorization for a single subtask. Owners may modify anything; an
 * editor may modify only shared, unassigned, or their own personal
 * subtasks — never another member's personal subtask. Viewers never reach
 * here (write endpoints already require at least editor). Mirrors the base
 * visibility predicate intentionally.
 */
export function canModifySubtask(
  subtask: VisibilitySubtask,
  viewer: { userId: string; role: ViewerRole },
): boolean {
  if (viewer.role === 'owner') return true;
  if (viewer.role === 'viewer') return false;
  return (
    subtask.isShared === true ||
    subtask.assigneeUserId === viewer.userId ||
    subtask.assigneeUserId == null
  );
}
