// Pure, IO-free normalization + validation behind GET /tasks/:taskId/project-plan.
// The backend owns ALL graph business logic (execution-item rule, edge
// direction, blocked/blocking derivation, deterministic forecast, layered
// layout, and cycle detection); web and mobile only render this output. Kept
// dependency-free (apart from the shared cycle detector) so every branch is
// trivially unit-testable.

import { findCyclicNodes } from '../plan-graph';
import { fallbackAvailability, FALLBACK_POLICY_TEXT, type MemberAvailability } from './member-availability';
import {
  buildResourceForecast,
  type NodeForecastStatus,
  type Priority,
  type ResourceForecast,
  type ResourceLane,
} from './resource-forecast.logic';

export type { Priority } from './resource-forecast.logic';

const DONE_STATUSES = new Set(['done', 'missed']);

export type PlanEntityType = 'task' | 'subtask';
export type PlanDependencyType = 'subtask' | 'cross_task';

export type PlanAssignee = { userId: string; displayName: string } | null;

export type FocusSummary = { sessionCount: number; spentMinutes: number };

export type ProjectPlanNode = {
  id: string;
  entityType: PlanEntityType;
  parentTaskId: string | null;
  title: string;
  status: string;
  assignee: PlanAssignee;
  estimatedMinutes: number | null;
  actualMinutes: number | null;
  remainingMinutes: number | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  forecastStart: string | null;
  forecastEnd: string | null;
  dueDate: string | null;
  progressPercent: number;
  isBlocked: boolean;
  blockedByIds: string[];
  blockingIds: string[];
  // Extras (superset of the required contract) the node drawer/sheet uses.
  focusSummary: FocusSummary | null;
  /** External cross-task context node (a different task), not this task's own work. */
  isExternal: boolean;
  /** The parent task shown only as a grouping anchor when it also has subtasks. */
  isGroup: boolean;
  /** Longest-path layer for deterministic layered layout (0 = a root). */
  layer: number;
  /** True when the node participates in a dependency cycle (forecast skipped). */
  inCycle: boolean;
  /** True when the item has no due date (surfaced as "unscheduled" in the UI). */
  isUnscheduled: boolean;
};

export type ProjectPlanEdge = {
  id: string;
  // Direction is prerequisite -> dependent: `target` cannot start until
  // `source` is complete. So a node's blockedBy = incoming edge sources.
  sourceId: string;
  targetId: string;
  dependencyType: PlanDependencyType;
};

export type ProjectPlanWarning = {
  code: 'cycle' | 'dangling_dependency' | 'self_dependency';
  message: string;
  nodeIds: string[];
};

export type CriticalPath = {
  status: 'available' | 'unavailable';
  itemIds: string[];
  durationMinutes: number | null;
  projectedCompletion: string | null;
  /** A human-readable explanation when deterministic scheduling cannot run. */
  reason: string | null;
};

export type ProjectPlanSchedule = {
  // --- Critical Path Method (present only when Critical Path is available) ---
  earliestStart?: string;
  earliestFinish?: string;
  latestStart?: string;
  latestFinish?: string;
  totalFloatMinutes?: number;
  isCritical?: boolean;
  // --- Resource-Aware Forecast (present for every execution item) ------------
  // When the item will actually be worked once resource contention + real
  // availability are honored — distinct from the CPM float above.
  forecastStart?: string | null;
  forecastEnd?: string | null;
  forecastStatus?: NodeForecastStatus;
  forecastReason?: string | null;
  /** Minutes the start slipped specifically because the assignee was busy elsewhere. */
  resourceConflictMinutes?: number;
  assigneeId?: string | null;
};

export type ProjectPlan = {
  taskId: string;
  generatedAt: string;
  nodes: ProjectPlanNode[];
  edges: ProjectPlanEdge[];
  warnings: ProjectPlanWarning[];
  criticalPath: CriticalPath;
  scheduling: Record<string, ProjectPlanSchedule>;
  /** Deterministic resource-aware forecast — "when will this actually finish?". */
  forecast: ResourceForecast;
  /** Per-assignee capacity vs. scheduled load over the forecast window. */
  resourceLanes: ResourceLane[];
};

// --- Raw inputs (loaded by the service) -------------------------------------

export type RawTask = {
  id: string;
  title: string;
  status: string;
  dueDate: Date | null;
  progress: number;
  estimatedTimeMinutes: number | null;
  spentTimeMinutes: number | null;
  ownerUserId: string;
  priority?: Priority;
};

export type RawSubtask = {
  id: string;
  title: string;
  status: string;
  isDone: boolean;
  assigneeUserId: string | null;
  startDate: Date | null;
  dueDate: Date | null;
  estimatedDurationMinutes: number | null;
  actualDurationMinutes: number | null;
  priority?: Priority;
};

export type RawSubtaskEdge = { subtaskId: string; dependsOnSubtaskId: string };

export type RawCrossDep = {
  /** 'depends' = this task depends on `other`; 'blocks' = `other` depends on this task. */
  direction: 'depends' | 'blocks';
  other: { id: string; title: string; status: string; ownerUserId: string };
};

export type BuildProjectPlanInput = {
  task: RawTask;
  subtasks: RawSubtask[];
  subtaskEdges: RawSubtaskEdge[];
  crossDeps: RawCrossDep[];
  nameById: Map<string, string>;
  focusById: Map<string, FocusSummary>;
  now: Date;
  /**
   * Per-member availability for the Resource-Aware Forecast. Optional so the pure
   * builder stays usable without it (missing members fall back to the documented
   * default availability). Loaded by the service from planner preferences +
   * recurring commitments.
   */
  availabilityByUser?: Map<string, MemberAvailability>;
  /** Local timezone offset (minutes; local = UTC + offset) used for fallbacks. */
  timezoneOffsetMinutes?: number;
};

// --- Helpers ----------------------------------------------------------------

function isDone(status: string, isDoneFlag = false): boolean {
  return isDoneFlag || status === 'done';
}

function remaining(estimated: number | null, actual: number | null): number | null {
  if (estimated == null) return null;
  return Math.max(0, estimated - (actual ?? 0));
}

function assigneeOf(userId: string | null, nameById: Map<string, string>): PlanAssignee {
  if (!userId) return null;
  return { userId, displayName: nameById.get(userId) ?? 'Member' };
}

function iso(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

function subtaskProgress(subtask: RawSubtask): number {
  if (isDone(subtask.status, subtask.isDone)) return 100;
  const est = subtask.estimatedDurationMinutes;
  const act = subtask.actualDurationMinutes;
  if (est && est > 0 && act && act > 0) return Math.min(99, Math.round((act / est) * 100));
  return 0;
}

/**
 * The single shared execution-item rule (see task spec): when a parent task has
 * subtasks, the subtasks ARE the execution items and the parent is never shown
 * as an equal independent work node — it appears only as a grouping anchor, and
 * only when cross-task dependencies must attach somewhere. A parent with no
 * subtasks is itself the execution item.
 */
export function buildProjectPlan(input: BuildProjectPlanInput): ProjectPlan {
  const { task, subtasks, subtaskEdges, crossDeps, nameById, focusById, now } = input;
  const hasSubtasks = subtasks.length > 0;
  const needsAnchor = hasSubtasks && crossDeps.length > 0;

  const nodes: ProjectPlanNode[] = [];
  const doneById = new Map<string, boolean>();

  function baseNode(partial: Omit<ProjectPlanNode, 'blockedByIds' | 'blockingIds' | 'isBlocked' | 'forecastStart' | 'forecastEnd' | 'layer' | 'inCycle'>): void {
    nodes.push({
      ...partial,
      isBlocked: false,
      blockedByIds: [],
      blockingIds: [],
      forecastStart: null,
      forecastEnd: null,
      layer: 0,
      inCycle: false,
    });
  }

  if (hasSubtasks) {
    for (const subtask of subtasks) {
      doneById.set(subtask.id, isDone(subtask.status, subtask.isDone));
      baseNode({
        id: subtask.id,
        entityType: 'subtask',
        parentTaskId: task.id,
        title: subtask.title,
        status: subtask.status,
        assignee: assigneeOf(subtask.assigneeUserId, nameById),
        estimatedMinutes: subtask.estimatedDurationMinutes,
        actualMinutes: subtask.actualDurationMinutes,
        remainingMinutes: remaining(subtask.estimatedDurationMinutes, subtask.actualDurationMinutes),
        plannedStart: iso(subtask.startDate),
        plannedEnd: iso(subtask.dueDate),
        dueDate: iso(subtask.dueDate),
        progressPercent: subtaskProgress(subtask),
        focusSummary: focusById.get(subtask.id) ?? null,
        isExternal: false,
        isGroup: false,
        isUnscheduled: subtask.dueDate == null,
      });
    }
  }

  // The task node: the execution item when there are no subtasks, otherwise the
  // grouping anchor (only emitted when cross-task edges need an endpoint).
  if (!hasSubtasks || needsAnchor) {
    doneById.set(task.id, isDone(task.status));
    baseNode({
      id: task.id,
      entityType: 'task',
      parentTaskId: null,
      title: task.title,
      status: task.status,
      assignee: assigneeOf(task.ownerUserId, nameById),
      estimatedMinutes: task.estimatedTimeMinutes ?? null,
      actualMinutes: task.spentTimeMinutes ?? null,
      remainingMinutes: remaining(task.estimatedTimeMinutes ?? null, task.spentTimeMinutes ?? null),
      plannedStart: null,
      plannedEnd: iso(task.dueDate),
      dueDate: iso(task.dueDate),
      progressPercent: Math.max(0, Math.min(100, task.progress ?? 0)),
      focusSummary: focusById.get(task.id) ?? null,
      isExternal: false,
      isGroup: hasSubtasks,
      isUnscheduled: task.dueDate == null,
    });
  }

  // External cross-task context nodes.
  for (const dep of crossDeps) {
    if (nodes.some((node) => node.id === dep.other.id)) continue;
    doneById.set(dep.other.id, isDone(dep.other.status));
    baseNode({
      id: dep.other.id,
      entityType: 'task',
      parentTaskId: null,
      title: dep.other.title,
      status: dep.other.status,
      assignee: assigneeOf(dep.other.ownerUserId, nameById),
      estimatedMinutes: null,
      actualMinutes: null,
      remainingMinutes: null,
      plannedStart: null,
      plannedEnd: null,
      dueDate: null,
      progressPercent: isDone(dep.other.status) ? 100 : 0,
      focusSummary: null,
      isExternal: true,
      isGroup: false,
      isUnscheduled: true,
    });
  }

  const nodeIds = new Set(nodes.map((node) => node.id));

  // --- Edges (prerequisite -> dependent) ------------------------------------
  const edges: ProjectPlanEdge[] = [];
  const warnings: ProjectPlanWarning[] = [];

  if (hasSubtasks) {
    for (const edge of subtaskEdges) {
      if (edge.subtaskId === edge.dependsOnSubtaskId) {
        warnings.push({
          code: 'self_dependency',
          message: 'A subtask depends on itself and the self-edge was dropped.',
          nodeIds: [edge.subtaskId],
        });
        continue;
      }
      if (!nodeIds.has(edge.subtaskId) || !nodeIds.has(edge.dependsOnSubtaskId)) {
        warnings.push({
          code: 'dangling_dependency',
          message: 'A subtask dependency references an item that is not in this plan.',
          nodeIds: [edge.subtaskId, edge.dependsOnSubtaskId].filter((id) => !nodeIds.has(id)),
        });
        continue;
      }
      edges.push({
        id: `st:${edge.dependsOnSubtaskId}->${edge.subtaskId}`,
        sourceId: edge.dependsOnSubtaskId,
        targetId: edge.subtaskId,
        dependencyType: 'subtask',
      });
    }
  }

  const anchorId = !hasSubtasks || needsAnchor ? task.id : null;
  if (anchorId) {
    for (const dep of crossDeps) {
      if (!nodeIds.has(dep.other.id)) continue;
      if (dep.direction === 'depends') {
        edges.push({
          id: `xt:${dep.other.id}->${anchorId}`,
          sourceId: dep.other.id,
          targetId: anchorId,
          dependencyType: 'cross_task',
        });
      } else {
        edges.push({
          id: `xt:${anchorId}->${dep.other.id}`,
          sourceId: anchorId,
          targetId: dep.other.id,
          dependencyType: 'cross_task',
        });
      }
    }
  }

  // --- Blocked / blocking (direct neighbors) --------------------------------
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const edge of edges) {
    const target = byId.get(edge.targetId);
    const source = byId.get(edge.sourceId);
    if (!target || !source) continue;
    target.blockedByIds.push(edge.sourceId);
    source.blockingIds.push(edge.targetId);
  }
  for (const node of nodes) {
    node.isBlocked = node.blockedByIds.some((id) => !doneById.get(id));
  }

  // --- Cycle detection (full DFS, not just direct reverse) ------------------
  const adjacency = new Map<string, string[]>();
  for (const node of nodes) adjacency.set(node.id, []);
  for (const edge of edges) adjacency.get(edge.sourceId)?.push(edge.targetId);
  const cyclic = findCyclicNodes(adjacency);
  if (cyclic.size) {
    for (const node of nodes) node.inCycle = cyclic.has(node.id);
    warnings.push({
      code: 'cycle',
      message:
        'This plan contains a circular dependency, so a forecast cannot be computed for the items involved. Fix the loop to restore scheduling.',
      nodeIds: [...cyclic],
    });
  }

  // --- Layered layout + deterministic dependency-only forecast (node level) --
  // (Unchanged: this is the CPM-adjacent, infinite-resource forecast on nodes.)
  assignLayersAndForecast(nodes, edges, cyclic, now);

  const critical = calculateCriticalPath(nodes, edges, cyclic, now);

  // --- Resource-Aware Forecast (real availability + one-member-at-a-time) ----
  const priorityById = new Map<string, Priority>();
  for (const subtask of subtasks) if (subtask.priority) priorityById.set(subtask.id, subtask.priority);
  if (task.priority) priorityById.set(task.id, task.priority);

  const offsetMinutes = input.timezoneOffsetMinutes ?? 0;
  const availabilityByUser = input.availabilityByUser ?? new Map<string, MemberAvailability>();
  const resource = buildResourceForecast({
    nodes,
    edges,
    cyclic,
    scheduling: critical.scheduling,
    priorityById,
    availabilityByUser,
    makeFallback: (userId, displayName) => fallbackAvailability(userId, displayName, offsetMinutes),
    fallbackPolicy: FALLBACK_POLICY_TEXT,
    deadline: task.dueDate,
    now,
  });

  // Merge the per-item resource forecast into the scheduling map alongside CPM.
  const scheduling: Record<string, ProjectPlanSchedule> = {};
  for (const [id, cpm] of Object.entries(critical.scheduling)) scheduling[id] = { ...cpm };
  for (const [id, nodeForecast] of resource.nodeForecasts) {
    scheduling[id] = { ...(scheduling[id] ?? {}), ...nodeForecast };
  }

  return {
    taskId: task.id,
    generatedAt: now.toISOString(),
    nodes,
    edges,
    warnings,
    criticalPath: critical.criticalPath,
    scheduling,
    forecast: resource.forecast,
    resourceLanes: resource.lanes,
  };
}

/**
 * Critical Path Method over the normalized prerequisite -> dependent graph.
 * Durations are remaining minutes: completed items contribute zero. Floats at
 * or below 0.001 minutes (0.06 seconds) are considered zero to avoid a
 * floating-point rounding artefact changing the critical-path result.
 */
export function calculateCriticalPath(
  nodes: ProjectPlanNode[],
  edges: ProjectPlanEdge[],
  cyclic: Set<string>,
  now: Date,
): { criticalPath: CriticalPath; scheduling: Record<string, ProjectPlanSchedule> } {
  const unavailable = (reason: string) => ({
    criticalPath: { status: 'unavailable' as const, itemIds: [], durationMinutes: null, projectedCompletion: null, reason },
    scheduling: {},
  });
  if (cyclic.size) return unavailable('Critical Path is unavailable because this plan contains a circular dependency. Fix the dependency loop first.');

  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const node of nodes) {
    // Null is deliberately distinct from zero: an estimate of zero is valid;
    // an unfinished item without an estimate has no deterministic duration.
    if (!isCompleteNode(node) && node.remainingMinutes == null) {
      return unavailable(`Critical Path is unavailable because “${node.title}” has no remaining-time estimate.`);
    }
  }

  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const node of nodes) {
    incoming.set(node.id, []);
    outgoing.set(node.id, []);
    indegree.set(node.id, 0);
  }
  for (const edge of edges) {
    if (!byId.has(edge.sourceId) || !byId.has(edge.targetId)) continue;
    outgoing.get(edge.sourceId)!.push(edge.targetId);
    incoming.get(edge.targetId)!.push(edge.sourceId);
    indegree.set(edge.targetId, indegree.get(edge.targetId)! + 1);
  }

  const queue = nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const dependent of outgoing.get(id)!) {
      const next = indegree.get(dependent)! - 1;
      indegree.set(dependent, next);
      if (next === 0) queue.push(dependent);
    }
  }
  if (order.length !== nodes.length) return unavailable('Critical Path is unavailable because the dependency graph is not a DAG.');

  const earliestStart = new Map<string, number>();
  const earliestFinish = new Map<string, number>();
  for (const id of order) {
    const start = (incoming.get(id) ?? []).reduce((maximum, predecessor) => Math.max(maximum, earliestFinish.get(predecessor) ?? 0), 0);
    const duration = isCompleteNode(byId.get(id)!) ? 0 : byId.get(id)!.remainingMinutes!;
    earliestStart.set(id, start);
    earliestFinish.set(id, start + duration);
  }
  const projectDuration = Math.max(0, ...[...earliestFinish.values()]);
  const latestStart = new Map<string, number>();
  const latestFinish = new Map<string, number>();
  for (const id of [...order].reverse()) {
    const successorStarts = (outgoing.get(id) ?? []).map((successor) => latestStart.get(successor)!);
    const finish = successorStarts.length ? Math.min(...successorStarts) : projectDuration;
    const duration = isCompleteNode(byId.get(id)!) ? 0 : byId.get(id)!.remainingMinutes!;
    latestFinish.set(id, finish);
    latestStart.set(id, finish - duration);
  }

  const base = now.getTime();
  const scheduling: Record<string, ProjectPlanSchedule> = {};
  const itemIds: string[] = [];
  for (const id of order) {
    const float = latestStart.get(id)! - earliestStart.get(id)!;
    const isCritical = Math.abs(float) <= 0.001;
    if (isCritical) itemIds.push(id);
    const toIso = (minutes: number) => new Date(base + minutes * 60_000).toISOString();
    scheduling[id] = {
      earliestStart: toIso(earliestStart.get(id)!),
      earliestFinish: toIso(earliestFinish.get(id)!),
      latestStart: toIso(latestStart.get(id)!),
      latestFinish: toIso(latestFinish.get(id)!),
      totalFloatMinutes: Math.abs(float) <= 0.001 ? 0 : float,
      isCritical,
    };
  }
  return {
    criticalPath: {
      status: 'available',
      itemIds,
      durationMinutes: projectDuration,
      projectedCompletion: new Date(base + projectDuration * 60_000).toISOString(),
      reason: null,
    },
    scheduling,
  };
}

function isCompleteNode(node: ProjectPlanNode): boolean {
  return node.progressPercent >= 100 || DONE_STATUSES.has(node.status);
}

/**
 * Longest-path layering and a forward dependency-only forecast, both over the
 * acyclic portion of the graph. Forecast is deterministic: an item can start
 * once every prerequisite is forecast to finish (never before now), and runs
 * for its remaining minutes. Resource contention (one assignee at a time) is
 * intentionally out of scope here — see known limits.
 */
function assignLayersAndForecast(
  nodes: ProjectPlanNode[],
  edges: ProjectPlanEdge[],
  cyclic: Set<string>,
  now: Date,
): void {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const prereqs = new Map<string, string[]>();
  for (const node of nodes) prereqs.set(node.id, []);
  for (const edge of edges) {
    if (cyclic.has(edge.sourceId) || cyclic.has(edge.targetId)) continue;
    prereqs.get(edge.targetId)?.push(edge.sourceId);
  }

  const layer = new Map<string, number>();
  const forecastEnd = new Map<string, number>();
  const nowMs = now.getTime();
  const visiting = new Set<string>();

  function resolve(id: string): { layer: number; end: number } {
    if (layer.has(id)) return { layer: layer.get(id)!, end: forecastEnd.get(id)! };
    const node = byId.get(id);
    if (!node || cyclic.has(id) || visiting.has(id)) {
      return { layer: 0, end: nowMs };
    }
    visiting.add(id);
    let maxLayer = 0;
    let startMs = nowMs;
    for (const prereqId of prereqs.get(id) ?? []) {
      const resolved = resolve(prereqId);
      maxLayer = Math.max(maxLayer, resolved.layer + 1);
      startMs = Math.max(startMs, resolved.end);
    }
    visiting.delete(id);
    const durationMs = (node.remainingMinutes ?? 0) * 60_000;
    const endMs = startMs + durationMs;
    layer.set(id, maxLayer);
    forecastEnd.set(id, endMs);
    if (!cyclic.has(id)) {
      node.layer = maxLayer;
      node.forecastStart = new Date(startMs).toISOString();
      node.forecastEnd = new Date(endMs).toISOString();
    }
    return { layer: maxLayer, end: endMs };
  }

  for (const node of nodes) resolve(node.id);
}
