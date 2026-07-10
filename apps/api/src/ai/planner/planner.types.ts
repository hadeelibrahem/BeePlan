// Internal + public type surface for the 3-layer AI Planner.
//
// The public `DailyPlan` / `DailyPlanItem` shapes are intentionally unchanged
// from the original single-file service so the existing endpoint response and
// the frontend keep working. The remaining interfaces describe the data that
// flows between the Rule Engine -> Reasoning Engine -> Scheduler Engine.

export type Priority = 'low' | 'medium' | 'high' | 'urgent';
export type PlanItemType = 'task' | 'reminder' | 'break' | 'calendar';
export type SectionKey = 'morning' | 'afternoon' | 'evening' | 'night';
export type EnergyLevel = 'high' | 'medium' | 'low';

/**
 * The kind of work a task represents. Drives energy matching: deep/creative/
 * learning work belongs in high-energy focus windows, while admin/light/errand
 * work can be placed in low-energy periods later in the day.
 */
export type TaskType =
  | 'deep'
  | 'light'
  | 'meeting'
  | 'errand'
  | 'admin'
  | 'creative'
  | 'learning'
  | 'exercise';

export type DurationConfidence = 'low' | 'medium' | 'high';

/** An estimated duration with the confidence and reason behind it. */
export interface DurationEstimate {
  minutes: number;
  confidence: DurationConfidence;
  reason: string;
  /** true when we had to estimate (no user-provided duration existed). */
  estimated: boolean;
}

/** A simple HH:mm..HH:mm window used for sleep/lunch/unavailable time. */
export type TimeWindow = { start: string; end: string };

/**
 * Top-level bucket for a task that did not make it onto today's timeline.
 * Distinguishes genuinely blocked/invalid tasks from ones simply pushed to a
 * later day because the day ran out of capacity.
 */
export type PostponeStatus =
  | 'POSTPONED_CAPACITY' // deliberately moved to a later day (capacity/limits)
  | 'BLOCKED_DEPENDENCY' // cannot run until a dependency is completed
  | 'NO_VALID_TIME_SLOT' // no free window big enough remained today
  | 'INVALID_TASK_DATA'; // task data was unusable (e.g. non-positive duration)

/** Fine-grained machine reason, surfaced to the UI for a precise explanation. */
export type PostponeReasonCode =
  | 'insufficient_capacity'
  | 'low_priority'
  | 'dependency_not_completed'
  | 'unavailable_time_window'
  | 'energy_mismatch'
  | 'meeting_reminder_conflict'
  | 'max_daily_work_limit'
  | 'sleep_lunch_unavailable_hours'
  | 'task_too_large'
  | 'invalid_task_data';

/**
 * Per-user planning preferences. These personalize how the planner schedules
 * the day, but never override hard constraints (dependencies, due/overdue
 * tasks, fixed reminders, locked items).
 */
export interface PlannerPreferences {
  focusStartTime: string; // HH:mm — start of the user's deep-work window
  focusEndTime: string; // HH:mm — end of the deep-work window
  workBlockMinutes: number; // preferred length of a single work block
  breakMinutes: number; // preferred break length between work blocks
  energy: Record<SectionKey, EnergyLevel>;
  scheduleHardTasksInFocus: boolean; // put difficult work in the focus window
  finishStartedFirst: boolean; // prioritize tasks with progress > 0
  groupSimilarTasks: boolean; // cluster same-category work
  bufferBeforeMeetings: boolean; // reserve time before reminders/meetings
  bufferMinutes: number; // how much buffer to reserve when enabled
  // Daily-capacity controls -------------------------------------------------
  maxDailyWorkMinutes: number; // cap on real work scheduled in a single day
  emergencyBufferMinutes: number; // slack always left unscheduled for the unexpected
  sleep: TimeWindow; // protected rest window (may cross midnight)
  lunch: TimeWindow; // protected lunch window
  unavailableHours: TimeWindow[]; // extra windows the user is never available
  note: string; // free-text personal instructions for the AI
}

export type WorkingHours = { start: string; end: string };
export type BreakInput = { start: string; end: string; title?: string };
export type LockedInput = { taskId?: string; reminderId?: string; startTime: string; endTime: string };

export type PlannerRequest = {
  date?: string;
  currentTime?: string;
  workingHours?: { start?: string; end?: string };
  breaks?: BreakInput[];
  lockedItems?: LockedInput[];
};

// -------- Public response shape (unchanged) ---------------------------------

export type DailyPlanItem = {
  id: string;
  type: PlanItemType;
  taskId?: string;
  reminderId?: string;
  title: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  priority: Priority;
  category?: string;
  isFocusTask?: boolean;
  locked?: boolean;
  rationale?: string;
};

export type UnscheduledItem = {
  taskId?: string;
  reminderId?: string;
  title: string;
  /** Human-readable explanation shown to the user. */
  reason: string;
  /** Top-level bucket (postponed vs blocked vs invalid vs no-slot). */
  status: PostponeStatus;
  /** Precise machine reason for the status. */
  reasonCode: PostponeReasonCode;
  estimatedMinutes?: number;
  priority?: Priority;
  /** ISO due date, when the task has one. */
  deadline?: string;
  /** Suggested day to try this task next (YYYY-MM-DD). */
  suggestedDate?: string;
};

/**
 * Snapshot of how the day's time budget was spent. Lets the UI show, at a
 * glance, capacity vs requested vs scheduled vs postponed work.
 */
export type CapacitySummary = {
  /** Real work minutes the day could hold (free time − buffer, capped). */
  availableMinutes: number;
  /** Sum of every schedulable task's estimated duration. */
  requestedMinutes: number;
  /** Task minutes actually placed on the timeline. */
  scheduledMinutes: number;
  /** Task minutes pushed to a later day. */
  postponedMinutes: number;
  scheduledTaskCount: number;
  postponedTaskCount: number;
  /** Supporting figures used to derive availableMinutes. */
  freeMinutes: number; // free minutes inside working hours after fixed blocks
  maxDailyWorkMinutes: number;
  emergencyBufferMinutes: number;
};

export type DailyPlan = {
  date: string;
  generatedAt: string;
  source: 'ai' | 'fallback';
  workingHours: WorkingHours;
  summary: string;
  sections: Record<SectionKey, DailyPlanItem[]>;
  unscheduled: UnscheduledItem[];
  capacity: CapacitySummary;
};

// -------- Layer 1 input: collected user context -----------------------------

export interface PlannerTask {
  id: string;
  title: string;
  priority: Priority;
  status: string;
  dueDate?: string; // ISO
  dueTime?: string | null;
  category?: string | null;
  estimatedMinutes: number;
  /** Whether estimatedMinutes was estimated (no user duration existed). */
  durationEstimated: boolean;
  durationConfidence: DurationConfidence;
  durationReason: string;
  /** Recognized kind of work — drives energy/window placement. */
  taskType: TaskType;
  spentMinutes: number;
  progress: number;
  isFocusTask: boolean;
  updatedAt: string; // ISO
  dependencyTaskIds: string[];
}

export interface PlannerReminder {
  id: string;
  title: string;
  priority: Priority;
  triggerDateTime?: string; // ISO
  startTime?: string; // HH:mm on the plan date, when known
  type: string;
}

export interface PlannerContext {
  userId: string;
  date: string;
  currentTime: string;
  workingHours: WorkingHours;
  breaks: BreakInput[];
  lockedItems: LockedInput[];
  tasks: PlannerTask[];
  reminders: PlannerReminder[];
  preferences: PlannerPreferences;
}

// -------- Layer 1 output: hard constraints ----------------------------------

/** A time block the scheduler must place verbatim and never overlap. */
export interface FixedBlock {
  id: string;
  type: PlanItemType;
  taskId?: string;
  reminderId?: string;
  title: string;
  startMinutes: number;
  endMinutes: number;
  priority: Priority;
  category?: string;
  isFocusTask: boolean;
  locked: boolean;
  rationale: string;
}

export interface BlockedTask {
  task: PlannerTask;
  reason: string;
  status: PostponeStatus;
  reasonCode: PostponeReasonCode;
}

export interface DayCapacity {
  /** Earliest minute-of-day work may start (max of working-hours start / now). */
  effectiveStartMinutes: number;
  /** Free minutes between effectiveStart and day end, after fixed blocks. */
  freeMinutes: number;
  /** Real work budget for the day: min(free − emergency buffer, max daily). */
  workBudgetMinutes: number;
}

export interface PlannerConstraints {
  workingHours: WorkingHours;
  /** Locked items + today's reminders + configured breaks, sorted by start. */
  fixedBlocks: FixedBlock[];
  /**
   * Reservations the scheduler must treat as busy but never render as items:
   * past time (before "now") and protected sleep/lunch/unavailable windows are
   * already fixedBlocks; this holds the past-time cutoff.
   */
  reservedBusy: { start: number; end: number }[];
  /** Task ids that are locked (already placed as fixed blocks). */
  lockedTaskIds: Set<string>;
  /** Tasks eligible to be scheduled (not done, not locked, deps satisfied). */
  schedulableTasks: PlannerTask[];
  /** Tasks that cannot run today because a dependency is still open. */
  blockedTasks: BlockedTask[];
  overdueTaskIds: Set<string>;
  dueTodayTaskIds: Set<string>;
  /** Deep-work window from the user's preferences, in minutes-from-midnight. */
  focusWindow: { startMinutes: number; endMinutes: number } | null;
  /** Computed daily capacity (effective start, free minutes, work budget). */
  capacity: DayCapacity;
  /** The preferences that shaped these constraints (passed down the pipeline). */
  preferences: PlannerPreferences;
}

// -------- Layer 2 output: reasoning decisions -------------------------------

export interface TaskDecision {
  taskId: string;
  rationale: string;
}

export interface ReasoningResult {
  source: 'ai' | 'fallback';
  order: TaskDecision[];
  summary: string;
}

// -------- Layer 3 validation feedback ---------------------------------------

export interface ValidationIssue {
  code: string;
  message: string;
}
