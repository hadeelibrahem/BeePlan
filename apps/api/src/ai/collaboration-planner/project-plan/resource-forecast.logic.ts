// Deterministic Resource-Aware Forecast.
//
// The Critical Path (project-plan.logic.ts) answers "what delays the project?" —
// it is dependency-only and assumes infinite parallel resources. This module
// answers the different question "when will the project ACTUALLY finish?" by
// mapping each item's REMAINING minutes onto real calendar time, honoring:
//   - dependencies (an item cannot start until every prerequisite finishes),
//   - resources (one member does one thing at a time; members work in parallel),
//   - availability (each member's real free windows + daily work cap),
// with a stable priority ordering so identical input always yields identical
// output. No LLM is involved — this is pure scheduling. Completed work is skipped
// (0 remaining minutes); unassigned / estimate-less / cyclic work is left
// unscheduled rather than guessed. Kept IO-free and dependency-light for testing.

import type { MemberAvailability } from './member-availability';
import type { ProjectPlanEdge, ProjectPlanNode, ProjectPlanSchedule } from './project-plan.logic';

export type Priority = 'low' | 'medium' | 'high' | 'urgent';

export type ForecastStatus = 'available' | 'unavailable' | 'partial';
export type NodeForecastStatus = 'scheduled' | 'unscheduled' | 'complete' | 'in_cycle';

export type ResourceForecast = {
  status: ForecastStatus;
  generatedAt: string;
  projectedCompletion: string | null;
  deadline: string | null;
  delayMinutes: number;
  delayDays: number;
  capacityShortfallMinutes: number;
  unscheduledItemIds: string[];
  bottleneckAssignee: { assigneeId: string; assigneeName: string; overloadMinutes: number } | null;
  fallbackPolicy: string | null;
  reasons: string[];
};

export type ResourceLane = {
  assigneeId: string;
  assigneeName: string;
  availableMinutes: number;
  scheduledMinutes: number;
  utilisationPercent: number;
  overloadMinutes: number;
};

/** Per-item resource forecast, merged into the scheduling map alongside the CPM fields. */
export type NodeResourceForecast = {
  forecastStart: string | null;
  forecastEnd: string | null;
  forecastStatus: NodeForecastStatus;
  forecastReason: string | null;
  /** Minutes an item's start slipped specifically because its assignee was busy on other work. */
  resourceConflictMinutes: number;
  assigneeId: string | null;
};

export type ResourceForecastResult = {
  forecast: ResourceForecast;
  lanes: ResourceLane[];
  nodeForecasts: Map<string, NodeResourceForecast>;
};

export type ResourceForecastInput = {
  nodes: ProjectPlanNode[];
  edges: ProjectPlanEdge[];
  cyclic: Set<string>;
  scheduling: Record<string, ProjectPlanSchedule>;
  priorityById: Map<string, Priority>;
  availabilityByUser: Map<string, MemberAvailability>;
  makeFallback: (userId: string, displayName: string) => MemberAvailability;
  fallbackPolicy: string;
  deadline: Date | null;
  now: Date;
  /** How far ahead scheduling may look before declaring a capacity shortfall. */
  horizonDays?: number;
};

const DONE_STATUSES = new Set(['done', 'missed']);
const DAY_MS = 24 * 60 * 60 * 1000;
const PRIORITY_RANK: Record<Priority, number> = { urgent: 4, high: 3, medium: 2, low: 1 };

function isComplete(node: ProjectPlanNode): boolean {
  return node.progressPercent >= 100 || DONE_STATUSES.has(node.status);
}

/** Execution items are this task's own work (never external context or the grouping anchor). */
function isExecutionItem(node: ProjectPlanNode): boolean {
  return !node.isExternal && !node.isGroup;
}

// --- Member calendar (mutable per member during scheduling) ------------------

type Interval = { start: number; end: number }; // UTC ms

type MemberCalendar = {
  availability: MemberAvailability;
  booked: Interval[]; // sorted, disjoint
};

/** Local wall-clock ms (offset-shifted) for a UTC instant. */
function toLocalMs(utcMs: number, offsetMinutes: number): number {
  return utcMs + offsetMinutes * 60_000;
}

/** UTC ms of local midnight for the local day containing `utcMs`. */
function localMidnightUtc(utcMs: number, offsetMinutes: number): number {
  const localMs = toLocalMs(utcMs, offsetMinutes);
  const localMidnight = Math.floor(localMs / DAY_MS) * DAY_MS;
  return localMidnight - offsetMinutes * 60_000;
}

function weekdayOf(localMidnightUtcMs: number, offsetMinutes: number): number {
  const localMs = toLocalMs(localMidnightUtcMs, offsetMinutes);
  return new Date(localMs).getUTCDay();
}

/** Minutes of `booked` intervals that fall inside [start, end). */
function bookedMinutesWithin(booked: Interval[], start: number, end: number): number {
  let total = 0;
  for (const interval of booked) {
    const lo = Math.max(interval.start, start);
    const hi = Math.min(interval.end, end);
    if (hi > lo) total += (hi - lo) / 60_000;
  }
  return total;
}

/** Free sub-slots of [start, end) after removing everything already booked. */
function freeSubSlots(booked: Interval[], start: number, end: number): Interval[] {
  const slots: Interval[] = [];
  let cursor = start;
  for (const interval of booked) {
    if (interval.end <= cursor || interval.start >= end) continue;
    if (interval.start > cursor) slots.push({ start: cursor, end: Math.min(interval.start, end) });
    cursor = Math.max(cursor, interval.end);
    if (cursor >= end) break;
  }
  if (cursor < end) slots.push({ start: cursor, end });
  return slots;
}

function insertBooked(booked: Interval[], interval: Interval): void {
  booked.push(interval);
  booked.sort((a, b) => a.start - b.start);
}

type BookResult = {
  segments: Interval[];
  startMs: number | null;
  endMs: number | null;
  placedMinutes: number;
  overflowMinutes: number;
  outsidePreferredMinutes: number;
};

/**
 * Book `minutes` of work for one member, no earlier than `earliestStartMs`, within
 * their free windows and daily cap, never overlapping work already on their
 * calendar. Walks forward day by day up to `horizonEndMs`. Returns the span
 * (first..last minute worked) and how much could not be placed before the horizon.
 */
function bookWork(
  calendar: MemberCalendar,
  earliestStartMs: number,
  minutes: number,
  horizonEndMs: number,
): BookResult {
  const { availability, booked } = calendar;
  const { offsetMinutes, maxDailyWorkMinutes, freeWindowsByWeekday, preferredWindowsByWeekday } = availability;
  const result: BookResult = {
    segments: [],
    startMs: null,
    endMs: null,
    placedMinutes: 0,
    overflowMinutes: minutes,
    outsidePreferredMinutes: 0,
  };
  if (minutes <= 0) {
    result.overflowMinutes = 0;
    return result;
  }

  let remaining = minutes;
  let dayMidnight = localMidnightUtc(earliestStartMs, offsetMinutes);
  let first = true;

  while (remaining > 0 && dayMidnight < horizonEndMs) {
    const weekday = weekdayOf(dayMidnight, offsetMinutes);
    const dayEnd = dayMidnight + DAY_MS;
    const alreadyBooked = bookedMinutesWithin(booked, dayMidnight, dayEnd);
    let dayBudget = Math.max(0, maxDailyWorkMinutes - alreadyBooked);
    const preferred = preferredWindowsByWeekday[weekday] ?? [];

    if (dayBudget > 0) {
      for (const window of freeWindowsByWeekday[weekday] ?? []) {
        if (remaining <= 0 || dayBudget <= 0) break;
        let windowStart = dayMidnight + window.start * 60_000;
        const windowEnd = dayMidnight + window.end * 60_000;
        // On the very first day the work cannot start before "now"/its earliest start.
        if (first) windowStart = Math.max(windowStart, earliestStartMs);
        if (windowEnd <= windowStart) continue;

        for (const slot of freeSubSlots(booked, windowStart, windowEnd)) {
          if (remaining <= 0 || dayBudget <= 0) break;
          const slotMinutes = (slot.end - slot.start) / 60_000;
          const take = Math.min(slotMinutes, remaining, dayBudget);
          if (take < 1) continue;
          const segment: Interval = { start: slot.start, end: slot.start + take * 60_000 };
          insertBooked(booked, segment);
          result.segments.push(segment);
          result.placedMinutes += take;
          remaining -= take;
          dayBudget -= take;
          if (result.startMs == null) result.startMs = segment.start;
          result.endMs = segment.end;
          // Minutes of this segment landing outside the member's preferred focus hours.
          const localSegStart = (segment.start - dayMidnight) / 60_000;
          const localSegEnd = (segment.end - dayMidnight) / 60_000;
          let preferredOverlap = 0;
          for (const pref of preferred) {
            preferredOverlap += Math.max(0, Math.min(localSegEnd, pref.end) - Math.max(localSegStart, pref.start));
          }
          result.outsidePreferredMinutes += Math.max(0, take - preferredOverlap);
        }
      }
    }

    first = false;
    dayMidnight = dayEnd;
  }

  result.overflowMinutes = remaining;
  return result;
}

// --- Ordering ----------------------------------------------------------------

/**
 * Deterministic scheduling priority (best first): critical items, then earliest
 * due date, then lowest float, then higher priority, then a stable id tie-break.
 * Identical input therefore always produces an identical schedule.
 */
function makeComparator(
  scheduling: Record<string, ProjectPlanSchedule>,
  priorityById: Map<string, Priority>,
  dueMsById: Map<string, number>,
) {
  return (a: string, b: string): number => {
    const critA = scheduling[a]?.isCritical ? 0 : 1;
    const critB = scheduling[b]?.isCritical ? 0 : 1;
    if (critA !== critB) return critA - critB;

    const dueA = dueMsById.get(a) ?? Number.POSITIVE_INFINITY;
    const dueB = dueMsById.get(b) ?? Number.POSITIVE_INFINITY;
    if (dueA !== dueB) return dueA - dueB;

    const floatA = scheduling[a]?.totalFloatMinutes ?? Number.POSITIVE_INFINITY;
    const floatB = scheduling[b]?.totalFloatMinutes ?? Number.POSITIVE_INFINITY;
    if (floatA !== floatB) return floatA - floatB;

    const prA = PRIORITY_RANK[priorityById.get(a) ?? 'medium'];
    const prB = PRIORITY_RANK[priorityById.get(b) ?? 'medium'];
    if (prA !== prB) return prB - prA;

    return a < b ? -1 : a > b ? 1 : 0;
  };
}

// --- Main --------------------------------------------------------------------

export function buildResourceForecast(input: ResourceForecastInput): ResourceForecastResult {
  const { nodes, edges, cyclic, scheduling, priorityById, now, deadline } = input;
  const nowMs = now.getTime();
  const horizonEndMs = nowMs + (input.horizonDays ?? 180) * DAY_MS;
  const generatedAt = now.toISOString();
  const deadlineIso = deadline ? deadline.toISOString() : null;

  const nodeForecasts = new Map<string, NodeResourceForecast>();
  const execNodes = nodes.filter(isExecutionItem);
  const byId = new Map(nodes.map((node) => [node.id, node]));

  const blank = (node: ProjectPlanNode): NodeResourceForecast => ({
    forecastStart: null,
    forecastEnd: null,
    forecastStatus: 'unscheduled',
    forecastReason: null,
    resourceConflictMinutes: 0,
    assigneeId: node.assignee?.userId ?? null,
  });
  for (const node of nodes) nodeForecasts.set(node.id, blank(node));

  // A cycle makes deterministic scheduling impossible — never invent a forecast.
  if (cyclic.size > 0) {
    for (const node of execNodes) {
      if (cyclic.has(node.id)) {
        const f = nodeForecasts.get(node.id)!;
        f.forecastStatus = 'in_cycle';
        f.forecastReason = 'In a dependency cycle — forecast unavailable until the loop is fixed.';
      }
    }
    return {
      forecast: {
        status: 'unavailable',
        generatedAt,
        projectedCompletion: null,
        deadline: deadlineIso,
        delayMinutes: 0,
        delayDays: 0,
        capacityShortfallMinutes: 0,
        unscheduledItemIds: execNodes.filter((n) => !isComplete(n)).map((n) => n.id),
        bottleneckAssignee: null,
        fallbackPolicy: input.fallbackPolicy,
        reasons: ['A circular dependency prevents a resource forecast. Fix the loop to restore scheduling.'],
      },
      lanes: [],
      nodeForecasts,
    };
  }

  // Prerequisite adjacency across ALL nodes (external/group endpoints included so a
  // not-yet-done upstream task still blocks its dependent's forecast).
  const prereqs = new Map<string, string[]>();
  for (const node of nodes) prereqs.set(node.id, []);
  for (const edge of edges) prereqs.get(edge.targetId)?.push(edge.sourceId);

  const finishMs = new Map<string, number>(); // scheduled or complete items
  const scheduledState = new Map<string, 'scheduled' | 'unschedulable'>();
  const calendars = new Map<string, MemberCalendar>();
  const scheduledMinutesByUser = new Map<string, number>();

  // Seed a calendar for every known member so idle members still surface as a
  // resource lane (full availability, zero scheduled) — the Team capacity view
  // needs every member, not only those with scheduled work.
  for (const [userId, availability] of input.availabilityByUser) {
    if (!calendars.has(userId)) calendars.set(userId, { availability, booked: [] });
  }

  const getCalendar = (node: ProjectPlanNode): MemberCalendar => {
    const userId = node.assignee!.userId;
    let calendar = calendars.get(userId);
    if (!calendar) {
      const availability =
        input.availabilityByUser.get(userId) ?? input.makeFallback(userId, node.assignee!.displayName);
      calendar = { availability, booked: [] };
      calendars.set(userId, calendar);
    }
    return calendar;
  };

  // Complete items contribute 0 remaining minutes and finish "now" for chaining.
  for (const node of execNodes) {
    if (isComplete(node)) {
      finishMs.set(node.id, nowMs);
      const f = nodeForecasts.get(node.id)!;
      f.forecastStatus = 'complete';
      f.forecastReason = 'Completed — no remaining work.';
    }
  }
  // External/group nodes: done ones finish "now"; incomplete ones stay unresolved
  // so their dependents cannot be forecast (documented below).
  for (const node of nodes) {
    if (!isExecutionItem(node) && isComplete(node)) finishMs.set(node.id, nowMs);
  }

  const dueMsById = new Map<string, number>();
  for (const node of nodes) {
    if (node.dueDate) {
      const t = new Date(node.dueDate).getTime();
      if (!Number.isNaN(t)) dueMsById.set(node.id, t);
    }
  }
  const comparator = makeComparator(scheduling, priorityById, dueMsById);

  // Serial schedule generation: repeatedly schedule the best "ready" item (all
  // prerequisites resolved) until none remain.
  const pending = new Set(
    execNodes.filter((n) => !isComplete(n)).map((n) => n.id),
  );

  const prereqOutcome = (id: string): 'ready' | 'wait' | 'blocked' => {
    let ready = true;
    for (const prereqId of prereqs.get(id) ?? []) {
      const prereq = byId.get(prereqId);
      if (!prereq) continue;
      if (finishMs.has(prereqId)) continue; // complete or already scheduled
      if (scheduledState.get(prereqId) === 'unschedulable') return 'blocked';
      if (!isExecutionItem(prereq)) return 'blocked'; // incomplete external/group upstream
      ready = false; // an own item that just hasn't been scheduled yet
    }
    return ready ? 'ready' : 'wait';
  };

  let guard = pending.size + 1;
  while (pending.size > 0 && guard-- > 0) {
    const ready: string[] = [];
    const blocked: string[] = [];
    for (const id of pending) {
      const outcome = prereqOutcome(id);
      if (outcome === 'ready') ready.push(id);
      else if (outcome === 'blocked') blocked.push(id);
    }

    // Nothing schedulable this round: everything left is blocked by an
    // unschedulable/incomplete-external prerequisite (or a wait-cycle we broke).
    if (ready.length === 0) {
      const stuck = blocked.length ? blocked : [...pending];
      for (const id of stuck) {
        const f = nodeForecasts.get(id)!;
        f.forecastStatus = 'unscheduled';
        f.forecastReason = f.forecastReason ?? UNSCHEDULABLE_PREREQ_REASON;
        scheduledState.set(id, 'unschedulable');
        pending.delete(id);
      }
      continue;
    }

    ready.sort(comparator);
    const id = ready[0];
    const node = byId.get(id)!;
    const f = nodeForecasts.get(id)!;

    // Unschedulable inputs: no assignee, or no remaining-time estimate.
    if (!node.assignee) {
      f.forecastStatus = 'unscheduled';
      f.forecastReason = 'Unassigned — assign a member to forecast this item.';
      scheduledState.set(id, 'unschedulable');
      pending.delete(id);
      continue;
    }
    if (node.remainingMinutes == null) {
      f.forecastStatus = 'unscheduled';
      f.forecastReason = 'No remaining-time estimate — add one to forecast this item.';
      scheduledState.set(id, 'unschedulable');
      pending.delete(id);
      continue;
    }

    const depFinish = (prereqs.get(id) ?? []).reduce(
      (max, pid) => Math.max(max, finishMs.get(pid) ?? nowMs),
      nowMs,
    );
    const calendar = getCalendar(node);
    const book = bookWork(calendar, depFinish, node.remainingMinutes, horizonEndMs);

    if (book.placedMinutes <= 0 || book.startMs == null || book.endMs == null) {
      // Member has no availability (zero capacity) before the horizon.
      f.forecastStatus = 'unscheduled';
      f.forecastReason = calendar.availability.freeWindowsByWeekday.every((w) => w.length === 0)
        ? `${node.assignee.displayName} has no available working time — forecast cannot place this item.`
        : `No free capacity for ${node.assignee.displayName} within the forecast horizon.`;
      scheduledState.set(id, 'unschedulable');
      pending.delete(id);
      continue;
    }

    // Resource conflict: minutes between the dependency-ready time and the actual
    // start that were lost to the assignee's OTHER booked work (not idle windows).
    const conflict = bookedMinutesWithinExcluding(calendar.booked, depFinish, book.startMs, book.segments);

    f.forecastStatus = 'scheduled';
    f.forecastStart = new Date(book.startMs).toISOString();
    f.forecastEnd = new Date(book.endMs).toISOString();
    f.resourceConflictMinutes = Math.round(conflict);
    const notes: string[] = [];
    if (conflict >= 1) notes.push(`waited ${Math.round(conflict)} min for ${node.assignee.displayName}`);
    if (book.outsidePreferredMinutes >= 1) notes.push('partly outside preferred hours');
    if (book.overflowMinutes >= 1) notes.push(`${Math.round(book.overflowMinutes)} min exceed available capacity`);
    f.forecastReason = notes.length ? capitalize(notes.join('; ')) + '.' : 'Scheduled within available capacity.';

    finishMs.set(id, book.endMs);
    scheduledState.set(id, 'scheduled');
    scheduledMinutesByUser.set(
      node.assignee.userId,
      (scheduledMinutesByUser.get(node.assignee.userId) ?? 0) + book.placedMinutes,
    );
    pending.delete(id);
  }

  // Any survivors of the guard fallback (should not happen with a DAG) → unscheduled.
  for (const id of pending) {
    const f = nodeForecasts.get(id)!;
    f.forecastStatus = 'unscheduled';
    f.forecastReason = f.forecastReason ?? 'Could not be scheduled deterministically.';
  }

  return finalize(input, {
    execNodes,
    nodeForecasts,
    finishMs,
    calendars,
    scheduledMinutesByUser,
    nowMs,
    generatedAt,
    deadlineIso,
    horizonEndMs,
  });
}

const UNSCHEDULABLE_PREREQ_REASON =
  'Waiting on a prerequisite that cannot be scheduled (unassigned, unestimated, or an unfinished external task).';

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Booked minutes in [start, end) that belong to OTHER items (exclude this item's own new segments). */
function bookedMinutesWithinExcluding(
  booked: Interval[],
  start: number,
  end: number,
  own: Interval[],
): number {
  if (end <= start) return 0;
  let total = 0;
  for (const interval of booked) {
    if (own.some((seg) => seg.start === interval.start && seg.end === interval.end)) continue;
    const lo = Math.max(interval.start, start);
    const hi = Math.min(interval.end, end);
    if (hi > lo) total += (hi - lo) / 60_000;
  }
  return total;
}

/** Member capacity (free minutes, capped daily) available within [nowMs, endMs). */
function availableMinutesWithin(availability: MemberAvailability, nowMs: number, endMs: number): number {
  if (endMs <= nowMs) return 0;
  const { offsetMinutes, maxDailyWorkMinutes, freeWindowsByWeekday } = availability;
  let total = 0;
  let dayMidnight = localMidnightUtc(nowMs, offsetMinutes);
  let first = true;
  // Bound the walk defensively (endMs is derived from a bounded horizon/deadline).
  let guard = 3660;
  while (dayMidnight < endMs && guard-- > 0) {
    const weekday = weekdayOf(dayMidnight, offsetMinutes);
    let dayMinutes = 0;
    for (const window of freeWindowsByWeekday[weekday] ?? []) {
      let ws = dayMidnight + window.start * 60_000;
      const we = Math.min(dayMidnight + window.end * 60_000, endMs);
      if (first) ws = Math.max(ws, nowMs);
      if (we > ws) dayMinutes += (we - ws) / 60_000;
    }
    total += Math.min(dayMinutes, maxDailyWorkMinutes);
    first = false;
    dayMidnight += DAY_MS;
  }
  return Math.round(total);
}

function finalize(
  input: ResourceForecastInput,
  ctx: {
    execNodes: ProjectPlanNode[];
    nodeForecasts: Map<string, NodeResourceForecast>;
    finishMs: Map<string, number>;
    calendars: Map<string, MemberCalendar>;
    scheduledMinutesByUser: Map<string, number>;
    nowMs: number;
    generatedAt: string;
    deadlineIso: string | null;
    horizonEndMs: number;
  },
): ResourceForecastResult {
  const { execNodes, nodeForecasts, finishMs, calendars, scheduledMinutesByUser, nowMs, generatedAt, deadlineIso } = ctx;

  let projectedMs: number | null = null;
  let capacityShortfallMinutes = 0;
  const unscheduledItemIds: string[] = [];

  for (const node of execNodes) {
    const f = nodeForecasts.get(node.id)!;
    if (f.forecastStatus === 'scheduled' && f.forecastEnd) {
      const end = new Date(f.forecastEnd).getTime();
      projectedMs = projectedMs == null ? end : Math.max(projectedMs, end);
    } else if (f.forecastStatus === 'unscheduled' || f.forecastStatus === 'in_cycle') {
      unscheduledItemIds.push(node.id);
      if (node.remainingMinutes != null) capacityShortfallMinutes += node.remainingMinutes;
    }
  }

  const deadlineMs = deadlineIso ? new Date(deadlineIso).getTime() : null;

  // Resource lanes: measured over [now, laneEnd]. Prefer the deadline as the yard-
  // stick (it is what "over capacity" means); fall back to the projected finish.
  const laneEnd = Math.max(
    nowMs,
    deadlineMs && deadlineMs > nowMs ? deadlineMs : projectedMs ?? nowMs,
  );
  const lanes: ResourceLane[] = [];
  for (const [userId, calendar] of calendars) {
    const scheduledMinutes = Math.round(scheduledMinutesByUser.get(userId) ?? 0);
    const availableMinutes = availableMinutesWithin(calendar.availability, nowMs, laneEnd);
    const overloadMinutes = Math.max(0, scheduledMinutes - availableMinutes);
    const utilisationPercent =
      availableMinutes > 0 ? Math.round((scheduledMinutes / availableMinutes) * 100) : scheduledMinutes > 0 ? 999 : 0;
    lanes.push({
      assigneeId: userId,
      assigneeName: calendar.availability.displayName,
      availableMinutes,
      scheduledMinutes,
      utilisationPercent,
      overloadMinutes,
    });
  }
  lanes.sort((a, b) =>
    b.overloadMinutes - a.overloadMinutes ||
    b.scheduledMinutes - a.scheduledMinutes ||
    (a.assigneeId < b.assigneeId ? -1 : 1),
  );

  const bottleneck =
    lanes.length && lanes[0].overloadMinutes > 0
      ? { assigneeId: lanes[0].assigneeId, assigneeName: lanes[0].assigneeName, overloadMinutes: lanes[0].overloadMinutes }
      : null;

  const projectedCompletion = projectedMs != null ? new Date(projectedMs).toISOString() : null;
  const delayMinutes =
    projectedMs != null && deadlineMs != null ? Math.max(0, Math.round((projectedMs - deadlineMs) / 60_000)) : 0;
  const delayDays = delayMinutes > 0 ? Math.ceil(delayMinutes / (60 * 24)) : 0;

  const hasUnscheduled = unscheduledItemIds.length > 0;
  const anyScheduledOrComplete = execNodes.some(
    (n) => nodeForecasts.get(n.id)!.forecastStatus === 'scheduled' || nodeForecasts.get(n.id)!.forecastStatus === 'complete',
  );
  const status: ForecastStatus = hasUnscheduled
    ? anyScheduledOrComplete
      ? 'partial'
      : 'unavailable'
    : 'available';

  const usedFallback = [...calendars.values()].some((c) => !c.availability.hasData);

  const reasons: string[] = [];
  if (delayMinutes > 0) reasons.push(`Projected to finish ${delayDays} day${delayDays === 1 ? '' : 's'} after the deadline.`);
  else if (deadlineMs != null && projectedMs != null) reasons.push('Projected to finish on or before the deadline.');
  if (hasUnscheduled) {
    reasons.push(
      `${unscheduledItemIds.length} item${unscheduledItemIds.length === 1 ? '' : 's'} could not be scheduled (unassigned, unestimated, blocked, or over capacity).`,
    );
  }
  if (bottleneck) {
    reasons.push(
      `${bottleneck.assigneeName} is the main bottleneck — ${bottleneck.overloadMinutes} min of work beyond their available capacity.`,
    );
  }
  if (capacityShortfallMinutes > 0) reasons.push(`Capacity shortfall of ${capacityShortfallMinutes} min across unscheduled work.`);
  if (!reasons.length) reasons.push('All work is scheduled within available capacity.');

  return {
    forecast: {
      status,
      generatedAt,
      projectedCompletion,
      deadline: deadlineIso,
      delayMinutes,
      delayDays,
      capacityShortfallMinutes,
      unscheduledItemIds,
      bottleneckAssignee: bottleneck,
      fallbackPolicy: usedFallback ? input.fallbackPolicy : null,
      reasons,
    },
    lanes,
    nodeForecasts,
  };
}
