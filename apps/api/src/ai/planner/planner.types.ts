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
  reason: string;
};

export type DailyPlan = {
  date: string;
  generatedAt: string;
  source: 'ai' | 'fallback';
  workingHours: WorkingHours;
  summary: string;
  sections: Record<SectionKey, DailyPlanItem[]>;
  unscheduled: UnscheduledItem[];
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
}

export interface PlannerConstraints {
  workingHours: WorkingHours;
  /** Locked items + today's reminders + configured breaks, sorted by start. */
  fixedBlocks: FixedBlock[];
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
