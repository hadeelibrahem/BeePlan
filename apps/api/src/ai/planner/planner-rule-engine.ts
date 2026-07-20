import { Injectable } from '@nestjs/common';
import { daysBetween, isTime, minutesBetween, toMinutes, todayString, windowToDayRanges } from './planner.util';
import type {
  BlockedTask,
  DailyPlan,
  FixedBlock,
  PlannerConstraints,
  PlannerContext,
  PlannerTask,
  Priority,
  ValidationIssue,
} from './planner.types';

/**
 * Layer 1 — Rule Engine.
 *
 * Owns every *hard* constraint. It never decides ordering or wording; it only
 * says what is legal: which tasks are eligible, which are blocked, which time
 * blocks are immovable, and whether a finished plan is realistic.
 */
@Injectable()
export class PlannerRuleEngine {
  /**
   * Turn raw user context into the constraint set the reasoning and scheduler
   * layers must respect.
   */
  prepareConstraints(context: PlannerContext): PlannerConstraints {
    const { tasks, date, preferences } = context;
    const dayStart = toMinutes(context.workingHours.start);
    const dayEnd = toMinutes(context.workingHours.end);

    // The context already excludes completed tasks (query filters status<>done),
    // but we guard again so the rule is enforced here and not just at the query.
    const activeTasks = tasks.filter((task) => task.status !== 'done');
    const activeIds = new Set(activeTasks.map((task) => task.id));

    const lockedTaskIds = new Set<string>();
    const lockedReminderIds = new Set<string>();
    const fixedBlocks: FixedBlock[] = [];

    // Push a fixed block only if it fits inside working hours and does not
    // overlap one that's already reserved. Blocks are added in priority order
    // (locked > reminders > sleep/lunch > unavailable > breaks > buffers) so a
    // lower-priority reservation politely yields to a higher-priority one
    // instead of producing an overlap the validator would later reject.
    const pushIfFree = (block: FixedBlock): boolean => {
      const start = Math.max(dayStart, block.startMinutes);
      const end = Math.min(dayEnd, block.endMinutes);
      if (end <= start) return false;
      const clamped = { ...block, startMinutes: start, endMinutes: end };
      const collides = fixedBlocks.some((existing) => start < existing.endMinutes && end > existing.startMinutes);
      if (collides) return false;
      fixedBlocks.push(clamped);
      return true;
    };

    // 1. Locked items are immovable and take precedence over everything else.
    for (const locked of context.lockedItems) {
      if (!isTime(locked.startTime) || !isTime(locked.endTime)) continue;
      if (toMinutes(locked.endTime) <= toMinutes(locked.startTime)) continue;
      const task = locked.taskId ? activeTasks.find((row) => row.id === locked.taskId) : undefined;
      const reminder = locked.reminderId ? context.reminders.find((row) => row.id === locked.reminderId) : undefined;
      if (locked.taskId) lockedTaskIds.add(locked.taskId);
      if (locked.reminderId) lockedReminderIds.add(locked.reminderId);
      // Locked items bypass pushIfFree: they must land exactly where the user
      // placed them, even if that means clamping is skipped.
      fixedBlocks.push({
        id: `locked-${locked.taskId ?? locked.reminderId}`,
        type: locked.taskId ? 'task' : 'reminder',
        taskId: locked.taskId,
        reminderId: locked.reminderId,
        title: task?.title ?? reminder?.title ?? 'Locked item',
        startMinutes: toMinutes(locked.startTime),
        endMinutes: toMinutes(locked.endTime),
        priority: task?.priority ?? reminder?.priority ?? 'medium',
        category: task?.category ?? undefined,
        isFocusTask: task?.isFocusTask ?? false,
        locked: true,
        rationale: 'Locked by you — kept exactly where you placed it.',
      });
    }

    // 2. Reminders are treated as fixed calendar-like blocks.
    for (const reminder of context.reminders) {
      if (lockedReminderIds.has(reminder.id)) continue;
      if (!reminder.startTime || !isTime(reminder.startTime)) continue;
      const start = toMinutes(reminder.startTime);
      pushIfFree({
        id: `reminder-${reminder.id}`,
        type: 'reminder',
        reminderId: reminder.id,
        title: reminder.title,
        startMinutes: start,
        endMinutes: start + 30,
        priority: reminder.priority,
        category: 'Reminder',
        isFocusTask: false,
        locked: false,
        rationale: 'Fixed at its reminder time.',
      });
    }

    // 3. Protected rest windows: sleep and lunch. Sleep may cross midnight, so
    //    each window can contribute one or two same-day ranges — only the parts
    //    that fall inside working hours matter.
    for (const range of windowToDayRanges(preferences.sleep.start, preferences.sleep.end)) {
      pushIfFree(restBlock('sleep', 'Sleep', 'Protected sleep — kept clear for rest.', range));
    }
    for (const range of windowToDayRanges(preferences.lunch.start, preferences.lunch.end)) {
      pushIfFree(restBlock('lunch', 'Lunch', 'Protected lunch break.', range));
    }

    // 4. User-defined unavailable windows (commute, prayer, gym, etc.).
    preferences.unavailableHours.forEach((window, index) => {
      for (const range of windowToDayRanges(window.start, window.end)) {
        pushIfFree({
          id: `unavailable-${index}-${range.start}`,
          type: 'break',
          title: 'Unavailable',
          startMinutes: range.start,
          endMinutes: range.end,
          priority: 'medium',
          category: 'Unavailable',
          isFocusTask: false,
          locked: false,
          rationale: 'You marked this time as unavailable.',
        });
      }
    });

    // 5. Configured recovery breaks.
    for (const breakItem of context.breaks) {
      if (!isTime(breakItem.start) || !isTime(breakItem.end)) continue;
      if (toMinutes(breakItem.end) <= toMinutes(breakItem.start)) continue;
      pushIfFree({
        id: `break-${breakItem.start}`,
        type: 'break',
        title: breakItem.title ?? 'Break',
        startMinutes: toMinutes(breakItem.start),
        endMinutes: toMinutes(breakItem.end),
        priority: 'medium',
        category: 'Break',
        isFocusTask: false,
        locked: false,
        rationale: 'Protected recovery time.',
      });
    }

    // 6. When the user wants a buffer before meetings, reserve time right
    //    before each reminder — pushIfFree drops it if it would collide.
    if (preferences.bufferBeforeMeetings && preferences.bufferMinutes > 0) {
      const reminderBlocks = fixedBlocks.filter((block) => block.type === 'reminder' && !block.locked);
      for (const reminderBlock of reminderBlocks) {
        const start = reminderBlock.startMinutes;
        const bufferStart = start - preferences.bufferMinutes;
        if (bufferStart < dayStart) continue;
        pushIfFree({
          id: `buffer-${reminderBlock.reminderId}`,
          type: 'break',
          title: `Buffer before ${reminderBlock.title}`,
          startMinutes: bufferStart,
          endMinutes: start,
          priority: 'medium',
          category: 'Buffer',
          isFocusTask: false,
          locked: false,
          rationale: `Buffer you asked to keep before meetings (${preferences.bufferMinutes} min).`,
        });
      }
    }

    fixedBlocks.sort((a, b) => a.startMinutes - b.startMinutes);

    // 5. Dependency validation: a task cannot run before its dependencies. A
    //    dependency that is still an active (incomplete) task blocks the task
    //    for today; a dependency that is no longer active is considered done.
    const overdueTaskIds = new Set<string>();
    const dueTodayTaskIds = new Set<string>();
    const schedulableTasks: PlannerTask[] = [];
    const blockedTasks: BlockedTask[] = [];

    for (const task of activeTasks) {
      if (task.dueDate) {
        const delta = daysBetween(date, new Date(task.dueDate));
        if (delta < 0) overdueTaskIds.add(task.id);
        else if (delta === 0) dueTodayTaskIds.add(task.id);
      }

      if (lockedTaskIds.has(task.id)) continue; // already fixed on the timeline

      const openDependency = task.dependencyTaskIds.find((depId) => activeIds.has(depId));
      if (openDependency) {
        blockedTasks.push({
          task,
          reason: 'Waiting for a dependency to be completed first.',
          status: 'BLOCKED_DEPENDENCY',
          reasonCode: 'dependency_not_completed',
        });
        continue;
      }

      // Guard against unusable durations so the scheduler never has to guess.
      if (!Number.isFinite(task.estimatedMinutes) || task.estimatedMinutes <= 0) {
        blockedTasks.push({
          task,
          reason: 'Could not determine how long this task takes.',
          status: 'INVALID_TASK_DATA',
          reasonCode: 'invalid_task_data',
        });
        continue;
      }

      schedulableTasks.push(task);
    }

    // Derive the deep-work window from preferences, clamped to working hours.
    const focusStart = Math.max(dayStart, toMinutes(preferences.focusStartTime));
    const focusEnd = Math.min(dayEnd, toMinutes(preferences.focusEndTime));
    const focusWindow = focusEnd > focusStart ? { startMinutes: focusStart, endMinutes: focusEnd } : null;

    // Respect the current time: when planning *today*, work can only start from
    // now (rounded up to the next 5 minutes) — the past is reserved as busy so
    // nothing is ever scheduled behind the clock. For any other date the whole
    // working day is available.
    const planningToday = date === todayString();
    const nowMinutes = planningToday && isTime(context.currentTime) ? roundUpTo5(toMinutes(context.currentTime)) : dayStart;
    const effectiveStartMinutes = Math.min(dayEnd, Math.max(dayStart, nowMinutes));
    const reservedBusy = effectiveStartMinutes > dayStart ? [{ start: dayStart, end: effectiveStartMinutes }] : [];

    // Capacity: free minutes remaining in the working day after fixed blocks,
    // then the real work budget once the emergency buffer and the max-daily-work
    // cap are applied. This is what the scheduler is allowed to fill.
    const freeMinutes = freeMinutesInWindow(effectiveStartMinutes, dayEnd, fixedBlocks);
    const workBudgetMinutes = Math.max(
      0,
      Math.min(freeMinutes - preferences.emergencyBufferMinutes, preferences.maxDailyWorkMinutes),
    );

    return {
      workingHours: context.workingHours,
      fixedBlocks,
      reservedBusy,
      lockedTaskIds,
      schedulableTasks,
      blockedTasks,
      overdueTaskIds,
      dueTodayTaskIds,
      focusWindow,
      capacity: { effectiveStartMinutes, freeMinutes, workBudgetMinutes },
      preferences,
    };
  }

  /**
   * Final safety check on a completed plan. Returns an empty array when the
   * plan is realistic; otherwise a list of issues the caller can log and use to
   * decide whether to fall back to deterministic planning.
   */
  validatePlan(plan: DailyPlan, constraints: PlannerConstraints): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const items = Object.values(plan.sections).flat();
    const sorted = [...items].sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));

    // No time overlaps.
    for (let i = 1; i < sorted.length; i += 1) {
      const previous = sorted[i - 1];
      const current = sorted[i];
      if (toMinutes(current.startTime) < toMinutes(previous.endTime)) {
        issues.push({
          code: 'overlap',
          message: `"${current.title}" overlaps "${previous.title}".`,
        });
      }
    }

    // Every item has a positive, well-formed duration.
    for (const item of items) {
      if (!isTime(item.startTime) || !isTime(item.endTime) || minutesBetween(item.startTime, item.endTime) <= 0) {
        issues.push({ code: 'bad-duration', message: `"${item.title}" has an invalid time range.` });
      }
    }

    // Locked items must stay exactly where the user locked them.
    for (const block of constraints.fixedBlocks) {
      if (!block.locked) continue;
      const match = items.find(
        (item) =>
          (block.taskId && item.taskId === block.taskId) ||
          (block.reminderId && item.reminderId === block.reminderId),
      );
      if (
        !match ||
        toMinutes(match.startTime) !== block.startMinutes ||
        toMinutes(match.endTime) !== block.endMinutes
      ) {
        issues.push({ code: 'locked-moved', message: `Locked item "${block.title}" was moved or dropped.` });
      }
    }

    // A dependency-blocked task must never appear on the timeline.
    const blockedIds = new Set(constraints.blockedTasks.map((entry) => entry.task.id));
    for (const item of items) {
      if (item.taskId && blockedIds.has(item.taskId)) {
        issues.push({ code: 'dependency', message: `Blocked task "${item.title}" was scheduled before its dependency.` });
      }
    }

    // Scheduled work should sit inside working hours.
    const dayStart = toMinutes(constraints.workingHours.start);
    const dayEnd = toMinutes(constraints.workingHours.end);
    for (const item of items) {
      if (item.type !== 'task') continue;
      if (toMinutes(item.startTime) < dayStart || toMinutes(item.endTime) > dayEnd) {
        issues.push({ code: 'out-of-hours', message: `"${item.title}" falls outside working hours.` });
      }
    }

    return issues;
  }
}

export function normalizePriority(value: unknown): Priority {
  if (value === 'urgent' || value === 'high' || value === 'medium' || value === 'low') return value;
  return 'medium';
}

/** Build a protected rest block (sleep/lunch) for a same-day minute range. */
function restBlock(id: string, title: string, rationale: string, range: { start: number; end: number }): FixedBlock {
  return {
    id: `${id}-${range.start}`,
    type: 'break',
    title,
    startMinutes: range.start,
    endMinutes: range.end,
    priority: 'medium',
    category: title,
    isFocusTask: false,
    locked: false,
    rationale,
  };
}

function roundUpTo5(minutes: number): number {
  return Math.ceil(minutes / 5) * 5;
}

/** Free minutes in [start, end) after subtracting the given fixed blocks. */
function freeMinutesInWindow(
  start: number,
  end: number,
  fixedBlocks: { startMinutes: number; endMinutes: number }[],
): number {
  if (end <= start) return 0;
  let busy = 0;
  const sorted = [...fixedBlocks]
    .map((block) => ({ start: Math.max(start, block.startMinutes), end: Math.min(end, block.endMinutes) }))
    .filter((block) => block.end > block.start)
    .sort((a, b) => a.start - b.start);
  // Merge overlaps so shared minutes aren't double-counted.
  let cursor = -1;
  for (const block of sorted) {
    const from = Math.max(block.start, cursor);
    if (block.end > from) busy += block.end - from;
    cursor = Math.max(cursor, block.end);
  }
  return Math.max(0, end - start - busy);
}

// Re-exported so tests and other layers can share the same time-window search.
export function findSlot(
  workingHours: WorkingHoursLike,
  busy: { start: number; end: number }[],
  duration: number,
): { start: number; end: number } | null {
  const dayStart = toMinutes(workingHours.start);
  const dayEnd = toMinutes(workingHours.end);
  let cursor = dayStart;
  const sortedBusy = [...busy].sort((a, b) => a.start - b.start);

  while (cursor + duration <= dayEnd) {
    const conflict = sortedBusy.find((slot) => cursor < slot.end && cursor + duration > slot.start);
    if (!conflict) return { start: cursor, end: cursor + duration };
    cursor = Math.max(cursor + 15, conflict.end);
  }

  return null;
}

type WorkingHoursLike = { start: string; end: string };
