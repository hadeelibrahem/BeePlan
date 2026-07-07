import { Injectable } from '@nestjs/common';
import { findSlot } from './planner-rule-engine';
import { fromMinutes, toMinutes } from './planner.util';
import type {
  DailyPlan,
  DailyPlanItem,
  FixedBlock,
  PlannerConstraints,
  PlannerContext,
  ReasoningResult,
  SectionKey,
  UnscheduledItem,
  WorkingHours,
} from './planner.types';

const EMPTY_SECTIONS = (): DailyPlan['sections'] => ({ morning: [], afternoon: [], evening: [], night: [] });
const ENERGY_RANK = { high: 3, medium: 2, low: 1 } as const;
const WORK_BLOCK_RANGE = { min: 15, max: 120 } as const;
const BREAK_RANGE = { min: 5, max: 30 } as const;

type Slot = { start: number; end: number };
type Window = { start: number; end: number };

/**
 * Layer 3 — Scheduler Engine.
 *
 * Converts the reasoning layer's ordered decisions into an actual timeline. It
 * personalizes placement using the user's preferences — deep/hard work lands in
 * the focus window and high-energy periods, work blocks and breaks follow the
 * preferred lengths — but always defers to the fixed blocks and working hours
 * the Rule Engine produced.
 */
@Injectable()
export class PlannerSchedulerEngine {
  build(
    reasoning: ReasoningResult,
    constraints: PlannerConstraints,
    context: PlannerContext,
    source: 'ai' | 'fallback',
  ): DailyPlan {
    const { workingHours, preferences } = constraints;
    const items: DailyPlanItem[] = constraints.fixedBlocks.map(fixedBlockToItem);
    const busy: Slot[] = constraints.fixedBlocks.map((block) => ({ start: block.startMinutes, end: block.endMinutes }));
    const unscheduled: UnscheduledItem[] = constraints.blockedTasks.map((entry) => ({
      taskId: entry.task.id,
      title: entry.task.title,
      reason: entry.reason,
    }));

    const tasksById = new Map(constraints.schedulableTasks.map((task) => [task.id, task]));
    const workBlock = clamp(preferences.workBlockMinutes, WORK_BLOCK_RANGE);
    const breakLength = clamp(preferences.breakMinutes, BREAK_RANGE);
    const preferredWindows = buildPreferredWindows(constraints, workingHours);

    for (const decision of reasoning.order) {
      const task = tasksById.get(decision.taskId);
      if (!task) continue;

      // Difficult work prefers the focus window / high-energy periods.
      const isHard =
        task.isFocusTask ||
        (preferences.scheduleHardTasksInFocus && (task.priority === 'high' || task.priority === 'urgent'));

      let remaining = Math.max(30, task.estimatedMinutes || 45);
      const segments: DailyPlanItem[] = [];
      let placedAny = false;
      let ranOut = false;

      while (remaining > 0) {
        const duration = Math.min(remaining, workBlock);
        const slot = isHard
          ? findSlotPreferred(workingHours, busy, duration, preferredWindows)
          : findSlot(workingHours, busy, duration);
        if (!slot) {
          ranOut = true;
          break;
        }

        segments.push({
          id: `task-${task.id}-${segments.length + 1}`,
          type: 'task',
          taskId: task.id,
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
        placedAny = true;
        remaining -= duration;

        // Insert a break of the user's preferred length between consecutive
        // work blocks, so we never chain long sessions back to back.
        if (remaining > 0) {
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

      if (ranOut) {
        unscheduled.push({
          taskId: task.id,
          title: task.title,
          reason: placedAny
            ? "Only part of it fit — the rest ran past today's available time."
            : 'No available free time left today.',
        });
      }
    }

    return {
      date: context.date,
      generatedAt: new Date().toISOString(),
      source,
      workingHours,
      summary: reasoning.summary,
      sections: groupSections(items),
      unscheduled,
    };
  }
}

/**
 * Ordered list of windows a difficult task should try before falling back to
 * "anywhere": the focus window first, then day parts by descending energy.
 */
function buildPreferredWindows(constraints: PlannerConstraints, workingHours: WorkingHours): Window[] {
  const windows: Window[] = [];
  if (constraints.focusWindow) {
    windows.push({ start: constraints.focusWindow.startMinutes, end: constraints.focusWindow.endMinutes });
  }

  const dayStart = toMinutes(workingHours.start);
  const dayEnd = toMinutes(workingHours.end);
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
