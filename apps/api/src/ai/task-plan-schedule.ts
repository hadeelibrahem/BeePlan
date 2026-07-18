// Deterministic server-side validator + repair layer for AI-generated focus
// schedules. Runs AFTER normalizeTaskPlanChatResponse, only on type "plan".
//
// Live Qwen validation showed prompt-only scheduling is unreliable: a 45-minute
// block preference could yield 90-minute sessions, large subtasks got
// under-scheduled, and same-day break gaps drifted. This layer fixes those
// deterministically without a second model call.
//
// Design notes / deliberate constraints:
//  - TIME BASIS: all reasoning is in UTC. Session times come back as ISO/Z, and
//    the model emits the day's working band in that same clock, so we compare
//    like-for-like.
//  - WORKING BAND: we do NOT enforce the stored preference focus window as an
//    absolute band. The model places sessions in whatever window the user's
//    availability (negotiated in the conversation) implies — e.g. evenings —
//    which the stored 08:00-11:00 default does not capture. Relocating those to
//    the stored window would destroy correct plans. So the per-day band is
//    derived from the model's own sessions; the repair fixes duration, gaps,
//    coverage, overlaps, ordering, past/deadline and busy-day conflicts WITHIN
//    that band, never moving work to a different time of day.
//  - PRESERVATION: when the existing schedule already satisfies every
//    constraint it is returned untouched. Otherwise the schedule is
//    deterministically re-packed from the model's first (anchor) day forward;
//    session→subtask mapping and already-valid durations are preserved, only
//    invalid subtasks' durations are rebuilt.
//  - FIXED-DURATION work (exam, mock exam, simulation, meeting, interview,
//    presentation, live event) is never split; if it cannot fit before the
//    deadline it is surfaced as overflow rather than mangled.

import type {
  TaskPlan,
  TaskPlanChatResponse,
  TaskPlanFocusSession,
  TaskPlanReminder,
  UnderstoodSummary,
} from './task-plan';

const DAY_MS = 24 * 60 * 60 * 1000;
const TITLE_MAX = 255;

// Keywords that mark a session as an inherently fixed-duration, uninterruptible
// activity that must not be split into work blocks.
const FIXED_KEYWORDS = [
  'mock exam',
  'exam',
  'simulation',
  'meeting',
  'interview',
  'presentation',
  'live event',
];

// A session is "substantially longer" than a work block past this factor.
const OVERSIZED_FACTOR = 1.5;
// Acceptable per-subtask coverage band.
const COVERAGE_MIN = 0.9;
const COVERAGE_MAX = 1.1;
// Horizon used only when the plan has no deadline, to keep placement bounded.
const NO_DEADLINE_HORIZON_DAYS = 60;

export interface ScheduleConstraints {
  now: Date;
  deadline: Date | null;
  /** Minutes from UTC midnight; the daily working band start. */
  focusStartMinutes: number;
  /** Minutes from UTC midnight; the daily working band end. */
  focusEndMinutes: number;
  workBlockMinutes: number;
  breakMinutes: number;
  /** 'YYYY-MM-DD' (UTC) days to avoid placing on where possible. */
  busyDays: Set<string>;
}

export interface Feasibility {
  fits: boolean;
  unplacedMinutes: number;
  unplacedSubtasks: string[];
}

export interface ScheduleRepairResult {
  focusSessions: TaskPlanFocusSession[];
  reminders: TaskPlanReminder[];
  feasibility: Feasibility;
}

export interface RepairContext {
  now: Date;
  preferences: {
    focusStartTime: string; // 'HH:mm'
    focusEndTime: string; // 'HH:mm'
    workBlockMinutes: number;
    breakMinutes: number;
  };
  busyDays: string[];
}

// --- small time helpers (all UTC) ------------------------------------------

function toDayStartMs(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function minuteOfDay(d: Date): number {
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function durationMinutes(session: TaskPlanFocusSession): number {
  return (
    (new Date(session.endTime).getTime() - new Date(session.startTime).getTime()) / 60000
  );
}

function hhmmToMinutes(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return 0;
  return Math.min(1439, Number(match[1]) * 60 + Number(match[2]));
}

function clampTitle(value: string): string {
  return value.length > TITLE_MAX ? value.slice(0, TITLE_MAX) : value;
}

function isFixed(sessionTitle: string, subtaskTitle: string): boolean {
  const hay = `${sessionTitle} ${subtaskTitle}`.toLowerCase();
  return FIXED_KEYWORDS.some((keyword) => hay.includes(keyword));
}

/**
 * Split an estimate into work blocks: as many full `block`-minute sessions as
 * fit, plus one shorter remainder session. Total equals the estimate exactly
 * (100% coverage), which sits inside the accepted 90-110% band.
 */
export function buildBlocks(estimateMinutes: number, blockMinutes: number): number[] {
  const est = Math.max(1, Math.round(estimateMinutes));
  const block = Math.max(1, Math.round(blockMinutes));
  if (est <= block) return [est];
  const fullCount = Math.floor(est / block);
  const remainder = est - fullCount * block;
  const blocks = new Array<number>(fullCount).fill(block);
  if (remainder > 0) blocks.push(remainder);
  return blocks;
}

// --- session planning (which sessions each subtask should have) -------------

interface SessionSpec {
  subtaskTitle: string;
  title: string;
  minutes: number;
  fixed: boolean;
}

interface Unit {
  order: number;
  anchorMs: number;
  specs: SessionSpec[];
}

function planUnits(
  plan: TaskPlan,
  c: ScheduleConstraints,
): { units: Unit[]; orphanSpecs: SessionSpec[]; orphanAnchor: number | null } {
  const subtaskByTitle = new Map(plan.subtasks.map((s) => [s.title, s]));
  const groups = new Map<string, TaskPlanFocusSession[]>();
  const orphanSessions: TaskPlanFocusSession[] = [];

  // Exact relatedSubtaskTitle matching: only subtasks the model actually
  // scheduled become eligible. Errands/calls/etc. with no session stay
  // unscheduled subtasks — never forced into focusSessions.
  for (const session of plan.focusSessions) {
    if (subtaskByTitle.has(session.relatedSubtaskTitle)) {
      const list = groups.get(session.relatedSubtaskTitle);
      if (list) list.push(session);
      else groups.set(session.relatedSubtaskTitle, [session]);
    } else {
      orphanSessions.push(session);
    }
  }

  const units: Unit[] = [];
  for (const [title, sessions] of groups) {
    const subtask = subtaskByTitle.get(title)!;
    const anyFixed = sessions.some((s) => isFixed(s.title, title));
    const total = sessions.reduce((sum, s) => sum + durationMinutes(s), 0);
    const oversized = sessions.some(
      (s) => durationMinutes(s) > c.workBlockMinutes * OVERSIZED_FACTOR,
    );
    const est = subtask.estimatedMinutes;

    let specs: SessionSpec[];
    if (anyFixed) {
      // Preserve fixed-duration sessions verbatim; never split them.
      specs = sessions.map((s) => ({
        subtaskTitle: title,
        title: clampTitle(s.title || title),
        minutes: Math.max(1, Math.round(durationMinutes(s))),
        fixed: true,
      }));
    } else if (oversized || total < est * COVERAGE_MIN || total > est * COVERAGE_MAX) {
      // Rebuild to block-sized sessions covering the estimate.
      const base = sessions[0]?.title || title;
      const blocks = buildBlocks(est, c.workBlockMinutes);
      specs = blocks.map((minutes, index) => ({
        subtaskTitle: title,
        title: clampTitle(
          blocks.length > 1 ? `${base} (session ${index + 1}/${blocks.length})` : base,
        ),
        minutes,
        fixed: false,
      }));
    } else {
      // Coverage and block sizes already acceptable: keep the model's durations.
      specs = sessions.map((s) => ({
        subtaskTitle: title,
        title: clampTitle(s.title || title),
        minutes: Math.max(1, Math.round(durationMinutes(s))),
        fixed: false,
      }));
    }

    const anchorMs = Math.min(...sessions.map((s) => new Date(s.startTime).getTime()));
    units.push({ order: subtask.order, anchorMs, specs });
  }

  // Dependency-safe order: by subtask order, then by the day the model chose.
  units.sort((a, b) => a.order - b.order || a.anchorMs - b.anchorMs);

  const orphanSpecs: SessionSpec[] = orphanSessions.map((s) => ({
    subtaskTitle: s.relatedSubtaskTitle,
    title: clampTitle(s.title),
    minutes: Math.max(1, Math.round(durationMinutes(s))),
    fixed: true, // treat as fixed so we preserve their duration
  }));
  const orphanAnchor = orphanSessions.length
    ? Math.min(...orphanSessions.map((s) => new Date(s.startTime).getTime()))
    : null;

  return { units, orphanSpecs, orphanAnchor };
}

// --- placement --------------------------------------------------------------

function makeSession(spec: SessionSpec, startMs: number, endMs: number): TaskPlanFocusSession {
  return {
    title: spec.title,
    startTime: new Date(startMs).toISOString(),
    endTime: new Date(endMs).toISOString(),
    relatedSubtaskTitle: spec.subtaskTitle,
  };
}

/**
 * Place an ordered list of specs across the given chronological day list.
 * Sequential, break-separated, non-overlapping, inside the band, never in the
 * past, never ending after the deadline. Returns what fit and what didn't.
 */
function placeOver(
  dayList: number[],
  specs: SessionSpec[],
  c: ScheduleConstraints,
  todayStart: number,
  nowMs: number,
  deadlineMs: number | null,
): { placed: TaskPlanFocusSession[]; leftover: SessionSpec[] } {
  const placed: TaskPlanFocusSession[] = [];
  let dayIdx = 0;
  let cursorMin = c.focusStartMinutes;
  let i = 0;

  outer: for (; i < specs.length; i += 1) {
    const spec = specs[i];
    for (;;) {
      if (dayIdx >= dayList.length) break outer; // out of days — rest is leftover
      const day = dayList[dayIdx];
      const floor =
        day === todayStart
          ? Math.max(c.focusStartMinutes, minuteOfDay(c.now) + 1)
          : c.focusStartMinutes;
      const startMin = Math.max(cursorMin, floor);
      const endMin = startMin + spec.minutes;
      // Non-fixed sessions must fit the band; fixed sessions may run past the
      // band end (they are real fixed-duration events) but still start in-band.
      const fitsBand = spec.fixed ? startMin >= c.focusStartMinutes : endMin <= c.focusEndMinutes;
      if (!fitsBand) {
        dayIdx += 1;
        cursorMin = c.focusStartMinutes;
        continue;
      }
      const startMs = day + startMin * 60000;
      const endMs = startMs + spec.minutes * 60000;
      if (startMs <= nowMs) {
        dayIdx += 1;
        cursorMin = c.focusStartMinutes;
        continue;
      }
      if (deadlineMs != null && endMs > deadlineMs) {
        // Chronological list: later days only push the end out further, so this
        // and every remaining spec cannot fit here.
        break outer;
      }
      placed.push(makeSession(spec, startMs, endMs));
      cursorMin = startMin + spec.minutes + c.breakMinutes;
      break; // next spec, same day cursor
    }
  }

  return { placed, leftover: specs.slice(i) };
}

function placeAll(
  units: Unit[],
  orphanSpecs: SessionSpec[],
  orphanAnchor: number | null,
  c: ScheduleConstraints,
): { sessions: TaskPlanFocusSession[]; feasibility: Feasibility } {
  const todayStart = toDayStartMs(c.now);
  const anchorCandidates = [
    ...units.map((u) => u.anchorMs),
    ...(orphanAnchor != null ? [orphanAnchor] : []),
  ];
  let anchorDay = anchorCandidates.length
    ? toDayStartMs(new Date(Math.min(...anchorCandidates)))
    : todayStart;
  if (anchorDay < todayStart) anchorDay = todayStart;

  const deadlineMs = c.deadline ? c.deadline.getTime() : null;
  const maxDay =
    deadlineMs != null
      ? toDayStartMs(new Date(deadlineMs))
      : anchorDay + NO_DEADLINE_HORIZON_DAYS * DAY_MS;

  // Primary = non-busy days; busy days are a last-resort fallback.
  const primaryDays: number[] = [];
  const fallbackDays: number[] = [];
  for (let day = anchorDay; day <= maxDay; day += DAY_MS) {
    if (c.busyDays.has(dayKey(day))) fallbackDays.push(day);
    else primaryDays.push(day);
  }

  const orderedSpecs: SessionSpec[] = [];
  for (const unit of units) orderedSpecs.push(...unit.specs);
  orderedSpecs.push(...orphanSpecs);

  const primary = placeOver(primaryDays, orderedSpecs, c, todayStart, nowMs(c), deadlineMs);
  let placed = primary.placed;
  let leftover = primary.leftover;

  if (leftover.length && fallbackDays.length) {
    // The busy-avoiding attempt above couldn't fit everything. Do NOT place only
    // the leftover suffix onto busy days in a separate pass: busy days can be
    // chronologically earlier than the primary-placed sessions, so a subtask's
    // later blocks (notably its short remainder) could land before its own full
    // blocks and, after the final sort, read as remainder-first. Instead re-place
    // ALL sessions in one chronological pass across every day, busy days
    // included. A single forward pass keeps each subtask's blocks in order (full
    // blocks first, remainder last), while busy days are still only reached
    // because the busy-free attempt fell short.
    const allDays = [...primaryDays, ...fallbackDays].sort((a, b) => a - b);
    const full = placeOver(allDays, orderedSpecs, c, todayStart, nowMs(c), deadlineMs);
    placed = full.placed;
    leftover = full.leftover;
  }

  placed.sort((a, b) => a.startTime.localeCompare(b.startTime));

  const unplacedMinutes = leftover.reduce((sum, s) => sum + s.minutes, 0);
  const unplacedSubtasks = [...new Set(leftover.map((s) => s.subtaskTitle))];

  return {
    sessions: placed,
    feasibility: {
      fits: leftover.length === 0,
      unplacedMinutes,
      unplacedSubtasks,
    },
  };
}

function nowMs(c: ScheduleConstraints): number {
  return c.now.getTime();
}

// --- validity check (early exit) -------------------------------------------

/**
 * True when the existing schedule already satisfies every constraint, so it can
 * be returned untouched. Coverage/oversize are checked per eligible non-fixed
 * subtask; never across all subtasks (unscheduled subtasks correctly have none).
 */
function isScheduleValid(plan: TaskPlan, c: ScheduleConstraints): boolean {
  const sessions = plan.focusSessions;
  const nowT = c.now.getTime();
  const deadlineMs = c.deadline ? c.deadline.getTime() : null;
  const subtaskByTitle = new Map(plan.subtasks.map((s) => [s.title, s]));

  const byDay = new Map<string, TaskPlanFocusSession[]>();
  for (const session of sessions) {
    const start = new Date(session.startTime);
    const end = new Date(session.endTime);
    if (start.getTime() <= nowT) return false;
    if (deadlineMs != null && end.getTime() > deadlineMs) return false;

    const startMin = minuteOfDay(start);
    const endMin = minuteOfDay(end);
    const fixed = isFixed(session.title, session.relatedSubtaskTitle);
    if (startMin < c.focusStartMinutes) return false;
    if (!fixed && endMin > c.focusEndMinutes) return false;

    const key = dayKey(toDayStartMs(start));
    const list = byDay.get(key);
    if (list) list.push(session);
    else byDay.set(key, [session]);
  }

  // Gaps + overlaps per day.
  for (const list of byDay.values()) {
    const sorted = [...list].sort((a, b) => a.startTime.localeCompare(b.startTime));
    for (let i = 1; i < sorted.length; i += 1) {
      const prevEnd = new Date(sorted[i - 1].endTime).getTime();
      const currStart = new Date(sorted[i].startTime).getTime();
      const gapMin = (currStart - prevEnd) / 60000;
      if (gapMin < c.breakMinutes) return false; // covers overlap (negative gap) too
    }
  }

  // Per-subtask coverage + block size (non-fixed only).
  const groups = new Map<string, TaskPlanFocusSession[]>();
  for (const session of sessions) {
    if (!subtaskByTitle.has(session.relatedSubtaskTitle)) continue;
    const list = groups.get(session.relatedSubtaskTitle);
    if (list) list.push(session);
    else groups.set(session.relatedSubtaskTitle, [session]);
  }
  for (const [title, list] of groups) {
    if (list.some((s) => isFixed(s.title, title))) continue;
    if (list.some((s) => durationMinutes(s) > c.workBlockMinutes * OVERSIZED_FACTOR)) {
      return false;
    }
    const est = subtaskByTitle.get(title)!.estimatedMinutes;
    const total = list.reduce((sum, s) => sum + durationMinutes(s), 0);
    if (total < est * COVERAGE_MIN || total > est * COVERAGE_MAX) return false;
  }

  return true;
}

// --- reminders --------------------------------------------------------------

/** Hard guarantee: no reminder in the past or after the deadline. */
function filterReminders(reminders: TaskPlanReminder[], c: ScheduleConstraints): TaskPlanReminder[] {
  const nowT = c.now.getTime();
  const deadlineMs = c.deadline ? c.deadline.getTime() : null;
  return reminders.filter((reminder) => {
    const at = new Date(reminder.remindAt).getTime();
    if (Number.isNaN(at)) return false;
    if (at <= nowT) return false;
    if (deadlineMs != null && at > deadlineMs) return false;
    return true;
  });
}

// --- public entry points ----------------------------------------------------

/** Pure core: validate and, if needed, deterministically repair a plan's schedule. */
export function repairFocusSchedule(
  plan: TaskPlan,
  c: ScheduleConstraints,
): ScheduleRepairResult {
  const reminders = filterReminders(plan.reminders, c);

  if (plan.focusSessions.length === 0) {
    return { focusSessions: [], reminders, feasibility: { fits: true, unplacedMinutes: 0, unplacedSubtasks: [] } };
  }

  if (isScheduleValid(plan, c)) {
    return {
      focusSessions: plan.focusSessions,
      reminders,
      feasibility: { fits: true, unplacedMinutes: 0, unplacedSubtasks: [] },
    };
  }

  const { units, orphanSpecs, orphanAnchor } = planUnits(plan, c);
  const { sessions, feasibility } = placeAll(units, orphanSpecs, orphanAnchor, c);
  return { focusSessions: sessions, reminders, feasibility };
}

/** Derive the working band (minutes-of-day) the model actually scheduled in. */
function observedBand(
  sessions: TaskPlanFocusSession[],
  prefs: RepairContext['preferences'],
): { start: number; end: number } {
  if (sessions.length === 0) {
    return { start: hhmmToMinutes(prefs.focusStartTime), end: hhmmToMinutes(prefs.focusEndTime) };
  }
  let start = Infinity;
  let end = -Infinity;
  for (const session of sessions) {
    start = Math.min(start, minuteOfDay(new Date(session.startTime)));
    end = Math.max(end, minuteOfDay(new Date(session.endTime)));
  }
  // Guard against a session that ends past midnight (minuteOfDay wraps) or a
  // degenerate band: always leave room for at least one work block.
  if (!Number.isFinite(start)) start = hhmmToMinutes(prefs.focusStartTime);
  if (end <= start) end = Math.min(1440, start + Math.max(prefs.workBlockMinutes, 60));
  return { start, end };
}

/**
 * Orchestrator: applies the schedule repair to a normalized chat response.
 * Only touches type "plan" responses; everything else (questions, advice,
 * Arabic or otherwise) passes through unchanged. When some required work cannot
 * fit before the deadline, the plan is still returned (best effort) but a clear
 * feasibility signal is attached to `message` and to `understoodSummary.risks`
 * — no new schema field is introduced.
 */
export function repairPlanResponse(
  response: TaskPlanChatResponse,
  ctx: RepairContext,
): TaskPlanChatResponse {
  if (response.type !== 'plan' || !response.plan) return response;

  const plan = response.plan;
  const deadline = plan.mainTask.dueDate ? new Date(plan.mainTask.dueDate) : null;
  const band = observedBand(plan.focusSessions, ctx.preferences);

  const constraints: ScheduleConstraints = {
    now: ctx.now,
    deadline: deadline && !Number.isNaN(deadline.getTime()) ? deadline : null,
    focusStartMinutes: band.start,
    focusEndMinutes: band.end,
    workBlockMinutes: Math.max(1, Math.round(ctx.preferences.workBlockMinutes)),
    breakMinutes: Math.max(0, Math.round(ctx.preferences.breakMinutes)),
    busyDays: new Set(ctx.busyDays),
  };

  const result = repairFocusSchedule(plan, constraints);
  const repairedPlan: TaskPlan = {
    ...plan,
    focusSessions: result.focusSessions,
    reminders: result.reminders,
  };

  if (result.feasibility.fits) {
    return { ...response, plan: repairedPlan };
  }

  // Surface the overflow rather than hiding it behind an apparently full plan.
  const overflow = result.feasibility.unplacedMinutes;
  const subtasks = result.feasibility.unplacedSubtasks;
  const warning =
    `⚠️ Heads up: about ${overflow} minutes of planned focus work ` +
    `couldn't be scheduled before the deadline. Consider extending the deadline, ` +
    `adding availability, or reducing scope.`;
  const risk =
    `Schedule overflow: ~${overflow} min of focus work` +
    (subtasks.length ? ` (${subtasks.join(', ')})` : '') +
    ` could not be placed before the deadline — extend the deadline, add availability, or cut scope.`;

  const message = `${warning}\n\n${response.message}`;
  const understoodSummary: UnderstoodSummary = response.understoodSummary
    ? { ...response.understoodSummary, risks: [...response.understoodSummary.risks, risk] }
    : {
        goal: plan.mainTask.title,
        goalType: null,
        deadline: plan.mainTask.dueDate,
        availableTime: null,
        currentProgress: null,
        deliverables: [],
        constraints: [],
        risks: [risk],
      };

  return { ...response, message, understoodSummary, plan: repairedPlan };
}
