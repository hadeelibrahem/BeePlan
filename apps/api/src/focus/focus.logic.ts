/**
 * Pure, side-effect-free logic for Focus Mode: stats aggregation and the
 * rules-based "what should I focus on now" recommendation. Kept separate from
 * the Nest service so it can be unit-tested without a database.
 */

export const FOCUS_SESSION_STATUSES = [
  'active',
  'paused',
  'completed',
  'cancelled',
] as const;
export type FocusSessionStatus = (typeof FOCUS_SESSION_STATUSES)[number];

export const FOCUS_SESSION_TYPES = [
  'pomodoro',
  'deep',
  'long',
  'custom',
  'break',
] as const;
export type FocusSessionType = (typeof FOCUS_SESSION_TYPES)[number];

export type FocusSessionForStats = {
  taskId: string | null;
  startedAt: Date;
  plannedMinutes: number;
  actualMinutes: number | null;
  status: string;
};

export type FocusStats = {
  focusMinutesToday: number;
  sessionsToday: number;
  completedSessionsToday: number;
  currentStreak: number;
  totalFocusMinutesThisWeek: number;
  topFocusTask: { taskId: string; title: string; minutes: number } | null;
};

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function startOfUtcWeek(date: Date): Date {
  const day = startOfUtcDay(date);
  // Week starts Monday. getUTCDay(): Sun=0..Sat=6 -> Monday index.
  const weekday = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - weekday);
  return day;
}

function dayKey(date: Date): string {
  return startOfUtcDay(date).toISOString().slice(0, 10);
}

/** Minutes actually spent in a session (real elapsed time, if recorded). */
function sessionMinutes(session: FocusSessionForStats): number {
  return Math.max(0, session.actualMinutes ?? 0);
}

export function computeFocusStats(
  sessions: FocusSessionForStats[],
  taskTitleById: Map<string, string>,
  now: Date = new Date(),
): FocusStats {
  const todayStart = startOfUtcDay(now).getTime();
  const weekStart = startOfUtcWeek(now).getTime();

  let focusMinutesToday = 0;
  let sessionsToday = 0;
  let completedSessionsToday = 0;
  let totalFocusMinutesThisWeek = 0;

  const minutesByTask = new Map<string, number>();
  const completedDays = new Set<string>();

  for (const session of sessions) {
    const startedMs = session.startedAt.getTime();
    const minutes = sessionMinutes(session);

    if (startedMs >= todayStart) {
      sessionsToday += 1;
      focusMinutesToday += minutes;
      if (session.status === 'completed') completedSessionsToday += 1;
    }

    if (startedMs >= weekStart) {
      totalFocusMinutesThisWeek += minutes;
    }

    if (session.taskId && minutes > 0) {
      minutesByTask.set(
        session.taskId,
        (minutesByTask.get(session.taskId) ?? 0) + minutes,
      );
    }

    if (session.status === 'completed') {
      completedDays.add(dayKey(session.startedAt));
    }
  }

  let topFocusTask: FocusStats['topFocusTask'] = null;
  for (const [taskId, minutes] of minutesByTask) {
    if (!topFocusTask || minutes > topFocusTask.minutes) {
      topFocusTask = {
        taskId,
        title: taskTitleById.get(taskId) ?? 'Focus task',
        minutes,
      };
    }
  }

  return {
    focusMinutesToday,
    sessionsToday,
    completedSessionsToday,
    currentStreak: computeStreak(completedDays, now),
    totalFocusMinutesThisWeek,
    topFocusTask,
  };
}

/**
 * Consecutive days (ending today or yesterday) that have at least one
 * completed focus session. Yesterday is allowed as the anchor so the streak
 * isn't reported as 0 first thing in the morning before today's first session.
 */
function computeStreak(completedDays: Set<string>, now: Date): number {
  if (completedDays.size === 0) return 0;

  const cursor = startOfUtcDay(now);
  if (!completedDays.has(dayKey(cursor))) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    if (!completedDays.has(dayKey(cursor))) return 0;
  }

  let streak = 0;
  while (completedDays.has(dayKey(cursor))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

export type FocusCandidate = {
  id: string;
  title: string;
  priority: string;
  status: string;
  dueDate: Date | null;
  estimatedMinutes: number;
  progress: number;
  isFocusTask: boolean;
  totalSubtasks: number;
  incompleteSubtasks: number;
};

export type FocusRecommendation = {
  taskId: string;
  taskTitle: string;
  reason: string;
  score: number;
};

const PRIORITY_SCORE: Record<string, number> = {
  urgent: 40,
  high: 30,
  medium: 15,
  low: 5,
};

/**
 * Rules-based recommendation for the single best task to focus on right now.
 * Considers priority, due proximity, focus-task flag, incomplete subtasks,
 * work already started, and having an estimate. Returns null when there is
 * nothing actionable.
 */
export function recommendFocusTask(
  candidates: FocusCandidate[],
  now: Date = new Date(),
): FocusRecommendation | null {
  const actionable = candidates.filter(
    (task) => task.status !== 'done' && task.status !== 'missed',
  );
  if (actionable.length === 0) return null;

  const scored = actionable.map((task) => {
    const factors = scoreCandidate(task, now);
    return { task, score: factors.score, reasons: factors.reasons };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Tie-break: nearer due date first, then title for stability.
    const aDue = a.task.dueDate?.getTime() ?? Number.POSITIVE_INFINITY;
    const bDue = b.task.dueDate?.getTime() ?? Number.POSITIVE_INFINITY;
    if (aDue !== bDue) return aDue - bDue;
    return a.task.title.localeCompare(b.task.title);
  });

  const best = scored[0];
  return {
    taskId: best.task.id,
    taskTitle: best.task.title,
    reason: buildReason(best.reasons),
    score: best.score,
  };
}

function scoreCandidate(
  task: FocusCandidate,
  now: Date,
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = PRIORITY_SCORE[task.priority] ?? 10;

  if (task.priority === 'urgent' || task.priority === 'high') {
    reasons.push('high priority');
  }

  if (task.dueDate) {
    const hoursUntilDue = (task.dueDate.getTime() - now.getTime()) / 3_600_000;
    if (hoursUntilDue < 0) {
      score += 35;
      reasons.push('overdue');
    } else if (hoursUntilDue <= 24) {
      score += 30;
      reasons.push('due soon');
    } else if (hoursUntilDue <= 72) {
      score += 15;
      reasons.push('due this week');
    }
  }

  if (task.isFocusTask) {
    score += 20;
    reasons.push('marked for focus');
  }

  if (task.incompleteSubtasks > 0) {
    score += Math.min(task.incompleteSubtasks * 3, 15);
    reasons.push('has unfinished steps');
  }

  if (task.status === 'in_progress' || task.progress > 0) {
    score += 10;
    reasons.push('already in progress');
  }

  if (task.estimatedMinutes > 0) {
    score += 5;
    reasons.push('needs deep concentration');
  }

  return { score, reasons };
}

function buildReason(reasons: string[]): string {
  const unique = [...new Set(reasons)];
  if (unique.length === 0) return 'A good task to make progress on now.';

  const top = unique.slice(0, 2);
  const sentence =
    top.length === 1 ? top[0] : `${top[0]} and ${top[1]}`;
  return `${capitalize(sentence)}.`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
