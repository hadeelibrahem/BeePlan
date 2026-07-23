// Canonical BeePlan subtask-assignment ("whose work is this?") rule — the single
// source of truth reused by the AI planner, the Focus recommendation/queue, the
// Focus-session start validation, and the task/subtask pickers so they cannot
// drift apart. Kept dependency-free so it is trivially unit-testable.
//
// On a SHARED (collaborative) task a subtask is a given user's own work only when
// it is explicitly assigned to them by user id. An unassigned team-backlog
// subtask therefore belongs to nobody's personal plan, and a subtask assigned to
// another member is that member's work — neither is this user's. On a PERSONAL
// (non-shared) task there is no assignment concept, so every subtask is the
// owner's. Matching is ALWAYS by user id — never by the free-text `assignee`
// label, a name, or an email. This mirrors the attribution
// WorkloadCapacityService uses to weigh each member's load.

// The minimal shape the rule needs — any row/entity carrying this field works.
export type OwnableSubtask = { assigneeUserId?: string | null };

/**
 * True when `subtask` is `userId`'s own schedulable/focusable work.
 *
 * @param isSharedTask whether the subtask's parent task is collaborative (has any
 *   task member). Callers determine this once (e.g. from `task_members`) and pass
 *   it in so the pure rule stays IO-free.
 */
export function isSubtaskOwnedByUser(
  subtask: OwnableSubtask,
  userId: string,
  isSharedTask: boolean,
): boolean {
  if (!isSharedTask) return true;
  return subtask.assigneeUserId === userId;
}
