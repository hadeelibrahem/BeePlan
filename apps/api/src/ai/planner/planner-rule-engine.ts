import { Injectable } from '@nestjs/common';
import { daysBetween, isTime, minutesBetween, toMinutes } from './planner.util';
import type {
  BlockedTask,
  DailyPlan,
  DailyPlanItem,
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

    // 1. Locked items are immovable and take precedence over everything else.
    for (const locked of context.lockedItems) {
      if (!isTime(locked.startTime) || !isTime(locked.endTime)) continue;
      if (toMinutes(locked.endTime) <= toMinutes(locked.startTime)) continue;
      const task = locked.taskId ? activeTasks.find((row) => row.id === locked.taskId) : undefined;
      const reminder = locked.reminderId ? context.reminders.find((row) => row.id === locked.reminderId) : undefined;
      if (locked.taskId) lockedTaskIds.add(locked.taskId);
      if (locked.reminderId) lockedReminderIds.add(locked.reminderId);
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
      fixedBlocks.push({
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

    // 3. Breaks are reserved recovery blocks.
    for (const breakItem of context.breaks) {
      if (!isTime(breakItem.start) || !isTime(breakItem.end)) continue;
      if (toMinutes(breakItem.end) <= toMinutes(breakItem.start)) continue;
      fixedBlocks.push({
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

    // 4. When the user wants a buffer before meetings, reserve time right
    //    before each reminder — but only if it doesn't collide with an already
    //    fixed block (locked item, other reminder, or break).
    if (preferences.bufferBeforeMeetings && preferences.bufferMinutes > 0) {
      const reminderBlocks = fixedBlocks.filter((block) => block.type === 'reminder' && !block.locked);
      for (const reminderBlock of reminderBlocks) {
        const start = reminderBlock.startMinutes;
        const bufferStart = start - preferences.bufferMinutes;
        if (bufferStart < dayStart) continue;
        const collides = fixedBlocks.some((block) => bufferStart < block.endMinutes && start > block.startMinutes);
        if (collides) continue;
        fixedBlocks.push({
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
        blockedTasks.push({ task, reason: 'Waiting for a dependency to be completed first.' });
        continue;
      }

      schedulableTasks.push(task);
    }

    // 6. Derive the deep-work window from preferences, clamped to working hours.
    const focusStart = Math.max(dayStart, toMinutes(preferences.focusStartTime));
    const focusEnd = Math.min(dayEnd, toMinutes(preferences.focusEndTime));
    const focusWindow = focusEnd > focusStart ? { startMinutes: focusStart, endMinutes: focusEnd } : null;

    return {
      workingHours: context.workingHours,
      fixedBlocks,
      lockedTaskIds,
      schedulableTasks,
      blockedTasks,
      overdueTaskIds,
      dueTodayTaskIds,
      focusWindow,
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
