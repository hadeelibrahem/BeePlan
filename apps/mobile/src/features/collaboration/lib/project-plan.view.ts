// Pure view helpers shared by the Plan tab's Dependency Graph and Timeline —
// selection (upstream/downstream traversal), filtering, and layer grouping.
// Mirrors apps/web/.../lib/project-plan.view.ts byte-for-byte (no shared
// package in this repo). Heavy graph business logic lives on the backend; these
// are lightweight deterministic view utilities so the components only render.

import type { ProjectPlanEdge, ProjectPlanNode, ProjectPlanSchedule, ResourceLane } from '../api/project-plan.api';

export type PlanFilters = {
  search: string;
  ownerId: string | null;
  status: string | null;
  blockedOnly: boolean;
  /** Restrict the view to specific items — set by a deep link, clearable by the user. */
  itemIds: string[] | null;
};

export const EMPTY_FILTERS: PlanFilters = {
  search: '',
  ownerId: null,
  status: null,
  blockedOnly: false,
  itemIds: null,
};

/**
 * Translate a backend deep-link focus into Plan filters. The backend decides
 * what a recommendation or alert is *about*; this only maps those fields onto
 * the filter controls the user can then adjust or clear.
 */
export function filtersFromFocus(
  focus: { itemIds?: string[]; memberId?: string; blockedOnly?: boolean; status?: string } | undefined,
): PlanFilters {
  if (!focus) return EMPTY_FILTERS;
  return {
    ...EMPTY_FILTERS,
    ownerId: focus.memberId ?? null,
    status: focus.status ?? null,
    blockedOnly: focus.blockedOnly ?? false,
    itemIds: focus.itemIds?.length ? focus.itemIds : null,
  };
}

/** True when any filter narrows the view (drives the "clear filters" affordance). */
export function hasActiveFilters(filters: PlanFilters): boolean {
  return Boolean(
    filters.search.trim() || filters.ownerId || filters.status || filters.blockedOnly || filters.itemIds,
  );
}

export function upstreamOf(id: string, edges: ProjectPlanEdge[]): Set<string> {
  const bySource = new Map<string, string[]>();
  for (const edge of edges) {
    const list = bySource.get(edge.targetId) ?? [];
    list.push(edge.sourceId);
    bySource.set(edge.targetId, list);
  }
  return traverse(id, bySource);
}

export function downstreamOf(id: string, edges: ProjectPlanEdge[]): Set<string> {
  const byTarget = new Map<string, string[]>();
  for (const edge of edges) {
    const list = byTarget.get(edge.sourceId) ?? [];
    list.push(edge.targetId);
    byTarget.set(edge.sourceId, list);
  }
  return traverse(id, byTarget);
}

function traverse(start: string, adjacency: Map<string, string[]>): Set<string> {
  const seen = new Set<string>();
  const stack = [...(adjacency.get(start) ?? [])];
  while (stack.length) {
    const next = stack.pop() as string;
    if (seen.has(next) || next === start) continue;
    seen.add(next);
    for (const neighbour of adjacency.get(next) ?? []) stack.push(neighbour);
  }
  return seen;
}

export function relatedPath(id: string, edges: ProjectPlanEdge[]): {
  self: string;
  upstream: Set<string>;
  downstream: Set<string>;
  all: Set<string>;
} {
  const upstream = upstreamOf(id, edges);
  const downstream = downstreamOf(id, edges);
  const all = new Set<string>([id, ...upstream, ...downstream]);
  return { self: id, upstream, downstream, all };
}

export function nodeMatchesFilters(node: ProjectPlanNode, filters: PlanFilters): boolean {
  if (filters.itemIds && !filters.itemIds.includes(node.id)) return false;
  if (filters.ownerId && node.assignee?.userId !== filters.ownerId) return false;
  if (filters.status && node.status !== filters.status) return false;
  if (filters.blockedOnly && !node.isBlocked) return false;
  if (filters.search.trim()) {
    const haystack = `${node.title} ${node.assignee?.displayName ?? ''}`.toLowerCase();
    if (!haystack.includes(filters.search.trim().toLowerCase())) return false;
  }
  return true;
}

export function filterNodeIds(nodes: ProjectPlanNode[], filters: PlanFilters): Set<string> {
  return new Set(nodes.filter((node) => nodeMatchesFilters(node, filters)).map((node) => node.id));
}

export function ownersOf(nodes: ProjectPlanNode[]): { userId: string; displayName: string }[] {
  const byId = new Map<string, string>();
  for (const node of nodes) {
    if (node.assignee) byId.set(node.assignee.userId, node.assignee.displayName);
  }
  return [...byId.entries()].map(([userId, displayName]) => ({ userId, displayName }));
}

export function statusesOf(nodes: ProjectPlanNode[]): string[] {
  return [...new Set(nodes.map((node) => node.status))];
}

// --- Resource-Aware Forecast view helpers -----------------------------------
// All resource scheduling is computed on the backend; these are pure read-only
// derivations shared by the Timeline, Dependency Graph, and node detail so the
// three surfaces render the same badges. No scheduling logic lives on the client.

/** Assignee ids the backend forecast marks as over their available capacity. */
export function overloadedAssigneeIds(lanes: ResourceLane[]): Set<string> {
  return new Set(lanes.filter((lane) => lane.overloadMinutes > 0).map((lane) => lane.assigneeId));
}

export type ResourceFlags = {
  resourceDelayed: boolean;
  forecastUnscheduled: boolean;
  overCapacity: boolean;
};

export function nodeResourceFlags(
  node: ProjectPlanNode,
  schedule: ProjectPlanSchedule | undefined,
  overloadedIds: Set<string>,
): ResourceFlags {
  const status = schedule?.forecastStatus;
  return {
    resourceDelayed: (schedule?.resourceConflictMinutes ?? 0) > 0,
    forecastUnscheduled: status === 'unscheduled' || status === 'in_cycle',
    overCapacity: Boolean(node.assignee && overloadedIds.has(node.assignee.userId)),
  };
}

/** Compact "Xh Ym" / "Ym" label for a minute count (never negative). */
export function formatMinutesLabel(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours && mins) return `${hours}h ${mins}m`;
  if (hours) return `${hours}h`;
  return `${mins}m`;
}

export type LayerGroup = { layer: number; nodes: ProjectPlanNode[] };

/** Nodes grouped by `layer` ascending (roots first). Preserves input order within a layer. */
export function groupByLayer(nodes: ProjectPlanNode[]): LayerGroup[] {
  const byLayer = new Map<number, ProjectPlanNode[]>();
  for (const node of nodes) {
    const list = byLayer.get(node.layer) ?? [];
    list.push(node);
    byLayer.set(node.layer, list);
  }
  return [...byLayer.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([layer, layerNodes]) => ({ layer, nodes: layerNodes }));
}

// --- Timeline layout --------------------------------------------------------

export type TimelineDomain = { startMs: number; endMs: number; todayFraction: number | null };
export type TimelineRow = {
  node: ProjectPlanNode;
  hasBar: boolean;
  plannedStartFraction: number | null;
  plannedEndFraction: number | null;
  forecastStartFraction: number | null;
  forecastEndFraction: number | null;
  isDelayed: boolean;
};

function ms(value: string | null): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

export function timelineDomain(
  nodes: ProjectPlanNode[],
  now: Date = new Date(),
  scheduling: Record<string, ProjectPlanSchedule> = {},
): TimelineDomain {
  const stamps: number[] = [];
  for (const node of nodes) {
    const schedule = scheduling[node.id];
    for (const value of [
      node.plannedStart,
      node.plannedEnd,
      node.forecastStart,
      node.forecastEnd,
      node.dueDate,
      schedule?.forecastStart ?? null,
      schedule?.forecastEnd ?? null,
    ]) {
      const time = ms(value);
      if (time != null) stamps.push(time);
    }
  }
  const nowMs = now.getTime();
  stamps.push(nowMs);
  const startMs = Math.min(...stamps);
  let endMs = Math.max(...stamps);
  if (endMs <= startMs) endMs = startMs + 7 * 24 * 60 * 60 * 1000;
  const todayFraction = nowMs >= startMs && nowMs <= endMs ? (nowMs - startMs) / (endMs - startMs) : null;
  return { startMs, endMs, todayFraction };
}

function fraction(value: string | null, domain: TimelineDomain): number | null {
  const time = ms(value);
  if (time == null) return null;
  const span = domain.endMs - domain.startMs;
  if (span <= 0) return 0;
  return Math.min(1, Math.max(0, (time - domain.startMs) / span));
}

export function buildTimelineRows(
  nodes: ProjectPlanNode[],
  domain: TimelineDomain,
  scheduling: Record<string, ProjectPlanSchedule> = {},
): TimelineRow[] {
  return nodes.map((node) => {
    const schedule = scheduling[node.id];
    const rForecastStart = schedule?.forecastStart ?? node.forecastStart;
    const rForecastEnd = schedule?.forecastEnd ?? node.forecastEnd;
    const plannedStartFraction = fraction(node.plannedStart, domain);
    const plannedEndFraction = fraction(node.plannedEnd ?? node.dueDate, domain);
    const forecastStartFraction = fraction(rForecastStart, domain);
    const forecastEndFraction = fraction(rForecastEnd, domain);
    const plannedEndMs = ms(node.plannedEnd ?? node.dueDate);
    const forecastEndMs = ms(rForecastEnd);
    const isDelayed = plannedEndMs != null && forecastEndMs != null && forecastEndMs > plannedEndMs;
    const hasBar =
      plannedStartFraction != null || plannedEndFraction != null || forecastStartFraction != null || forecastEndFraction != null;
    return {
      node,
      hasBar,
      plannedStartFraction,
      plannedEndFraction,
      forecastStartFraction,
      forecastEndFraction,
      isDelayed,
    };
  });
}
