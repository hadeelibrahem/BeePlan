import { Injectable } from '@nestjs/common';
import { findSlot } from './planner-rule-engine';
import { addDays, fromMinutes, toMinutes } from './planner.util';
import type {
  CapacitySummary,
  DailyPlan,
  DailyPlanItem,
  FixedBlock,
  PlannerConstraints,
  PlannerContext,
  PlannerTask,
  PostponeReasonCode,
  ReasoningResult,
  SectionKey,
  TaskDecision,
  TaskType,
  UnscheduledItem,
  WorkingHours,
} from './planner.types';

const EMPTY_SECTIONS = (): DailyPlan['sections'] => ({ morning: [], afternoon: [], evening: [], night: [] });
const ENERGY_RANK = { high: 3, medium: 2, low: 1 } as const;
const WORK_BLOCK_RANGE = { min: 15, max: 120 } as const;
const BREAK_RANGE = { min: 5, max: 30 } as const;
const MIN_TASK_MINUTES = 15;

/** Work that belongs in high-energy focus windows. */
const HARD_TASK_TYPES: ReadonlySet<TaskType> = new Set(['deep', 'learning', 'creative']);

type Slot = { start: number; end: number };
type Window = { start: number; end: number };

/**
 * Layer 3 — Scheduler Engine.
 *
 * Converts the reasoning layer's ordered decisions into an actual timeline
 * while respecting the day's real capacity:
 *   - never schedules before "now" (past time is reserved busy),
 *   - never exceeds the daily work budget (free time − emergency buffer, capped
 *     by max daily work hours) so the day is never packed minute-to-minute,
 *   - matches task type to energy (deep/creative/learning in focus windows,
 *     admin/errand/light later),
 *   - splits long tasks into focus blocks separated by breaks,
 *   - and postpones whatever doesn't fit with a precise, human reason.
 */
@Injectable()
export class PlannerSchedulerEngine {
  build(
    reasoning: ReasoningResult,
    constraints: PlannerConstraints,
    context: PlannerContext,
    source: 'ai' | 'fallback',
  ): DailyPlan {
    const { workingHours, preferences, capacity } = constraints;
    const items: DailyPlanItem[] = constraints.fixedBlocks.map(fixedBlockToItem);
    // Seed "busy" with fixed blocks AND non-rendered reservations (past time).
    const busy: Slot[] = [
      ...constraints.fixedBlocks.map((block) => ({ start: block.startMinutes, end: block.endMinutes })),
      ...constraints.reservedBusy,
    ];

    const unscheduled: UnscheduledItem[] = constraints.blockedTasks.map((entry) => ({
      taskId: entry.task.taskId,
      subtaskId: entry.task.subtaskId ?? undefined,
      title: entry.task.title,
      reason: entry.reason,
      status: entry.status,
      reasonCode: entry.reasonCode,
      estimatedMinutes: entry.task.estimatedMinutes,
      priority: entry.task.priority,
      deadline: entry.task.dueDate,
      suggestedDate: addDays(context.date, 1),
    }));

    const tasksById = new Map(constraints.schedulableTasks.map((task) => [task.id, task]));
    // Preserve valid subtask ordering: place any sibling a candidate depends on
    // before the candidate itself, keeping the reasoning order otherwise intact.
    const order = orderRespectingDependencies(reasoning.order, tasksById);
    const workBlock = clamp(preferences.workBlockMinutes, WORK_BLOCK_RANGE);
    const breakLength = clamp(preferences.breakMinutes, BREAK_RANGE);
    const preferredHardWindows = buildPreferredWindows(constraints, workingHours, 'hard');
    const preferredSoftWindows = buildPreferredWindows(constraints, workingHours, 'soft');
    const suggestedDate = addDays(context.date, 1);

    // Which limit set the work budget decides how we phrase capacity postpones.
    const budgetBoundByMaxDaily =
      capacity.freeMinutes - preferences.emergencyBufferMinutes > preferences.maxDailyWorkMinutes;

    let scheduledWorkMinutes = 0;
    let scheduledTaskCount = 0;
    let postponedTaskCount = 0;
    let postponedMinutes = 0;

    for (const decision of order) {
      const task = tasksById.get(decision.taskId);
      if (!task) continue;

      const budgetRemaining = capacity.workBudgetMinutes - scheduledWorkMinutes;

      // No budget left at all — the day is full. Everything from here is a
      // deliberate capacity postponement to a later day.
      if (budgetRemaining < MIN_TASK_MINUTES) {
        unscheduled.push(
          capacityPostpone(task, task.estimatedMinutes, suggestedDate, budgetBoundByMaxDaily),
        );
        postponedTaskCount += 1;
        postponedMinutes += task.estimatedMinutes;
        continue;
      }

      const hard = isHardTask(task, preferences.scheduleHardTasksInFocus);
      const windows = hard ? preferredHardWindows : preferredSoftWindows;

      // Cap this task's placement at the remaining budget; the overflow (if any)
      // is postponed for capacity rather than dropped.
      const placeable = Math.min(task.estimatedMinutes, budgetRemaining);
      const overBudget = task.estimatedMinutes - placeable;

      let remaining = placeable;
      let placedForTask = 0;
      const segments: DailyPlanItem[] = [];
      let noSlot = false;

      while (remaining >= 1) {
        const duration = Math.min(remaining, workBlock);
        const slot = findSlotPreferred(workingHours, busy, duration, windows);
        if (!slot) {
          noSlot = true;
          break;
        }

        segments.push({
          id: `task-${task.id}-${segments.length + 1}`,
          type: 'task',
          taskId: task.taskId,
          subtaskId: task.subtaskId ?? undefined,
          title: task.title,
          startTime: fromMinutes(slot.start),
          endTime: fromMinutes(slot.end),
          durationMinutes: duration,
          priority: task.priority,
          category: task.category ?? undefined,
          isFocusTask: task.isFocusTask,
          locked: false,
          rationale: decision.rationale,
        });
        busy.push(slot);
        placedForTask += duration;
        remaining -= duration;

        // Insert a break of the preferred length between consecutive work
        // blocks so we never chain long sessions back to back.
        if (remaining >= 1) {
          const breakSlot = findSlot(workingHours, busy, breakLength);
          if (breakSlot && breakSlot.start === slot.end) {
            items.push(breakBlock(breakSlot, breakLength));
            busy.push(breakSlot);
          }
        }
      }

      if (segments.length > 1) {
        segments.forEach((segment, index) => {
          segment.title = `${task.title} (${index + 1})`;
        });
      }
      items.push(...segments);

      scheduledWorkMinutes += placedForTask;
      if (placedForTask > 0) scheduledTaskCount += 1;

      // Account for whatever couldn't be placed: budget overflow first, then a
      // genuine "no free slot" reason for the part the timeline couldn't hold.
      const leftover = task.estimatedMinutes - placedForTask;
      if (leftover > 0) {
        postponedTaskCount += 1;
        postponedMinutes += leftover;
        if (overBudget > 0 && !noSlot) {
          unscheduled.push(capacityPostpone(task, leftover, suggestedDate, budgetBoundByMaxDaily, placedForTask > 0));
        } else {
          unscheduled.push(
            noSlotPostpone(task, leftover, suggestedDate, busy, workingHours, workBlock, placedForTask > 0),
          );
        }
      }
    }

    const capacitySummary: CapacitySummary = {
      availableMinutes: capacity.workBudgetMinutes,
      requestedMinutes: constraints.schedulableTasks.reduce((sum, task) => sum + task.estimatedMinutes, 0),
      scheduledMinutes: scheduledWorkMinutes,
      postponedMinutes,
      scheduledTaskCount,
      postponedTaskCount,
      freeMinutes: capacity.freeMinutes,
      maxDailyWorkMinutes: preferences.maxDailyWorkMinutes,
      emergencyBufferMinutes: preferences.emergencyBufferMinutes,
    };

    return {
      date: context.date,
      generatedAt: new Date().toISOString(),
      source,
      workingHours,
      summary: reasoning.summary,
      sections: groupSections(items),
      unscheduled,
      capacity: capacitySummary,
    };
  }
}

/**
 * Reorder the reasoning decisions so that, for any candidate with intra-task
 * ordering dependencies, every sibling it depends on appears earlier. The
 * original order is preserved wherever the dependency graph allows, so priority
 * ranking is only overridden when a valid subtask order requires it. Cycles (if
 * any slipped through) are broken by falling back to the original position.
 */
function orderRespectingDependencies(
  order: TaskDecision[],
  tasksById: Map<string, PlannerTask>,
): TaskDecision[] {
  const byId = new Map(order.map((decision) => [decision.taskId, decision]));
  const placed = new Set<string>();
  const visiting = new Set<string>();
  const result: TaskDecision[] = [];

  const visit = (id: string): void => {
    if (placed.has(id) || visiting.has(id)) return;
    const decision = byId.get(id);
    if (!decision) return;
    visiting.add(id);
    for (const depId of tasksById.get(id)?.orderDependencyIds ?? []) {
      if (byId.has(depId)) visit(depId);
    }
    visiting.delete(id);
    placed.add(id);
    result.push(decision);
  };

  for (const decision of order) visit(decision.taskId);
  return result;
}

function isHardTask(task: PlannerTask, scheduleHardTasksInFocus: boolean): boolean {
  if (task.isFocusTask) return true;
  if (HARD_TASK_TYPES.has(task.taskType)) return true;
  return scheduleHardTasksInFocus && (task.priority === 'high' || task.priority === 'urgent');
}

/** Build a capacity-postponement entry (whole task or budget overflow). */
function capacityPostpone(
  task: PlannerTask,
  minutes: number,
  suggestedDate: string,
  boundByMaxDaily: boolean,
  partial = false,
): UnscheduledItem {
  const reasonCode: PostponeReasonCode = boundByMaxDaily ? 'max_daily_work_limit' : 'insufficient_capacity';
  const limit = boundByMaxDaily ? 'your maximum daily work hours' : "today's available time";
  const reason = partial
    ? `Part of it fit today; the remaining ${minutes} min was moved to ${suggestedDate} to stay within ${limit}.`
    : `Moved to ${suggestedDate} — today is already full to ${limit}.`;
  return {
    taskId: task.taskId,
    subtaskId: task.subtaskId ?? undefined,
    title: task.title,
    reason,
    status: 'POSTPONED_CAPACITY',
    reasonCode,
    estimatedMinutes: minutes,
    priority: task.priority,
    deadline: task.dueDate,
    suggestedDate,
  };
}

/** Build a "no valid slot" entry, distinguishing too-large from fragmentation. */
function noSlotPostpone(
  task: PlannerTask,
  minutes: number,
  suggestedDate: string,
  busy: Slot[],
  workingHours: WorkingHours,
  workBlock: number,
  partial: boolean,
): UnscheduledItem {
  const largestGap = largestFreeGap(workingHours, busy);
  const blockNeeded = Math.min(minutes, workBlock, MIN_TASK_MINUTES);
  const tooLarge = blockNeeded > largestGap;
  const reasonCode: PostponeReasonCode = tooLarge ? 'task_too_large' : 'meeting_reminder_conflict';
  const reason = partial
    ? `Only part of it fit — the rest couldn't find a free block today and moves to ${suggestedDate}.`
    : tooLarge
      ? `No free block long enough today (largest gap ${largestGap} min); moved to ${suggestedDate}.`
      : `Your fixed blocks left no free slot today; moved to ${suggestedDate}.`;
  return {
    taskId: task.taskId,
    subtaskId: task.subtaskId ?? undefined,
    title: task.title,
    reason,
    status: 'NO_VALID_TIME_SLOT',
    reasonCode,
    estimatedMinutes: minutes,
    priority: task.priority,
    deadline: task.dueDate,
    suggestedDate,
  };
}

/** Largest single free gap remaining inside working hours. */
function largestFreeGap(workingHours: WorkingHours, busy: Slot[]): number {
  const dayStart = toMinutes(workingHours.start);
  const dayEnd = toMinutes(workingHours.end);
  const sorted = [...busy]
    .map((slot) => ({ start: Math.max(dayStart, slot.start), end: Math.min(dayEnd, slot.end) }))
    .filter((slot) => slot.end > slot.start)
    .sort((a, b) => a.start - b.start);
  let cursor = dayStart;
  let largest = 0;
  for (const slot of sorted) {
    if (slot.start > cursor) largest = Math.max(largest, slot.start - cursor);
    cursor = Math.max(cursor, slot.end);
  }
  if (dayEnd > cursor) largest = Math.max(largest, dayEnd - cursor);
  return largest;
}

/**
 * Ordered windows a task should try before falling back to "anywhere".
 *
 * `hard` (deep/creative/learning/focus) work prefers the focus window, then the
 * remaining day parts by *descending* energy, so difficult work lands in peak
 * hours. `soft` (admin/errand/light) work simply takes the earliest available
 * slot (empty windows → the caller falls through to "anywhere"); the reasoning
 * layer has already front-loaded the important work, so deep tasks claim the
 * peak hours first and light work fills in around them.
 */
function buildPreferredWindows(
  constraints: PlannerConstraints,
  workingHours: WorkingHours,
  kind: 'hard' | 'soft',
): Window[] {
  if (kind === 'soft') return [];

  const dayStart = toMinutes(workingHours.start);
  const dayEnd = toMinutes(workingHours.end);
  const focus = constraints.focusWindow;
  const windows: Window[] = [];
  if (focus) windows.push({ start: focus.startMinutes, end: focus.endMinutes });

  const bounds: Record<SectionKey, Window> = {
    morning: { start: dayStart, end: Math.min(dayEnd, 12 * 60) },
    afternoon: { start: Math.max(dayStart, 12 * 60), end: Math.min(dayEnd, 17 * 60) },
    evening: { start: Math.max(dayStart, 17 * 60), end: Math.min(dayEnd, 20 * 60) },
    night: { start: Math.max(dayStart, 20 * 60), end: dayEnd },
  };

  const sections = (Object.keys(bounds) as SectionKey[])
    .filter((key) => bounds[key].end > bounds[key].start)
    .sort((a, b) => ENERGY_RANK[constraints.preferences.energy[b]] - ENERGY_RANK[constraints.preferences.energy[a]]);

  for (const key of sections) windows.push(bounds[key]);
  return windows;
}

function findSlotPreferred(workingHours: WorkingHours, busy: Slot[], duration: number, windows: Window[]): Slot | null {
  const dayStart = toMinutes(workingHours.start);
  const dayEnd = toMinutes(workingHours.end);
  for (const window of windows) {
    const start = Math.max(dayStart, window.start);
    const end = Math.min(dayEnd, window.end);
    if (end - start < duration) continue;
    const slot = findSlotInWindow(start, end, busy, duration);
    if (slot) return slot;
  }
  // Nothing in the preferred windows — take the earliest free slot anywhere.
  return findSlot(workingHours, busy, duration);
}

function findSlotInWindow(windowStart: number, windowEnd: number, busy: Slot[], duration: number): Slot | null {
  let cursor = windowStart;
  const sortedBusy = [...busy].sort((a, b) => a.start - b.start);
  while (cursor + duration <= windowEnd) {
    const conflict = sortedBusy.find((slot) => cursor < slot.end && cursor + duration > slot.start);
    if (!conflict) return { start: cursor, end: cursor + duration };
    cursor = Math.max(cursor + 15, conflict.end);
  }
  return null;
}

function fixedBlockToItem(block: FixedBlock): DailyPlanItem {
  return {
    id: block.id,
    type: block.type,
    taskId: block.taskId,
    subtaskId: block.subtaskId,
    reminderId: block.reminderId,
    title: block.title,
    startTime: fromMinutes(block.startMinutes),
    endTime: fromMinutes(block.endMinutes),
    durationMinutes: Math.max(5, block.endMinutes - block.startMinutes),
    priority: block.priority,
    category: block.category,
    isFocusTask: block.isFocusTask,
    locked: block.locked,
    rationale: block.rationale,
  };
}

function breakBlock(slot: Slot, minutes: number): DailyPlanItem {
  return {
    id: `break-recovery-${slot.start}`,
    type: 'break',
    title: 'Recovery break',
    startTime: fromMinutes(slot.start),
    endTime: fromMinutes(slot.end),
    durationMinutes: minutes,
    priority: 'medium',
    category: 'Break',
    isFocusTask: false,
    locked: false,
    rationale: `Break between work blocks (${minutes} min, your preferred length).`,
  };
}

function groupSections(items: DailyPlanItem[]): DailyPlan['sections'] {
  const sections = EMPTY_SECTIONS();
  for (const item of [...items].sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime))) {
    sections[sectionForTime(item.startTime)].push(item);
  }
  return sections;
}

function sectionForTime(time: string): SectionKey {
  const minutes = toMinutes(time);
  if (minutes < 12 * 60) return 'morning';
  if (minutes < 17 * 60) return 'afternoon';
  if (minutes < 20 * 60) return 'evening';
  return 'night';
}

function clamp(value: number, range: { min: number; max: number }): number {
  if (!Number.isFinite(value)) return range.min;
  return Math.max(range.min, Math.min(range.max, Math.round(value)));
}
