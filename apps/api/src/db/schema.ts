import {
  type AnyPgColumn,
  boolean,
  date,
  decimal,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

const id = () => uuid('id').defaultRandom().primaryKey();
const createdAt = () => timestamp('created_at').defaultNow().notNull();
const updatedAt = () => timestamp('updated_at').defaultNow().notNull();

export const users = pgTable('users', {
  id: id(),
  fullName: varchar('full_name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  avatarUrl: text('avatar_url'),
  authProvider: varchar('auth_provider', { length: 40 })
    .notNull()
    .default('password'),
  googleId: varchar('google_id', { length: 255 }).unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  timezone: varchar('timezone', { length: 100 }).notNull().default('UTC'),
  // Bumped on logout and password reset so previously-issued JWTs (which
  // carry the version they were signed with) stop being accepted —
  // see JwtAuthGuard and AuthService.logout/resetPassword.
  tokenVersion: integer('token_version').notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const passwordResetCodes = pgTable('password_reset_codes', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  codeHash: text('code_hash').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  createdAt: createdAt(),
});

export const googleLoginApprovals = pgTable('google_login_approvals', {
  id: id(),
  tokenHash: text('token_hash').notNull().unique(),
  pollTokenHash: text('poll_token_hash').notNull().unique(),
  googleId: varchar('google_id', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  fullName: varchar('full_name', { length: 255 }).notNull(),
  avatarUrl: text('avatar_url'),
  emailVerified: boolean('email_verified').notNull().default(true),
  oauthState: text('oauth_state'),
  decision: varchar('decision', { length: 20 }).notNull().default('pending'),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  sessionClaimedAt: timestamp('session_claimed_at'),
  createdAt: createdAt(),
});

export const standaloneNotes = pgTable('standalone_notes', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  content: text('content'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const plannerPreferences = pgTable('planner_preferences', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  focusStartTime: varchar('focus_start_time', { length: 5 })
    .notNull()
    .default('08:00'),
  focusEndTime: varchar('focus_end_time', { length: 5 })
    .notNull()
    .default('11:00'),
  workBlockMinutes: integer('work_block_minutes').notNull().default(50),
  breakMinutes: integer('break_minutes').notNull().default(10),
  energyMorning: varchar('energy_morning', { length: 10 })
    .notNull()
    .default('high'),
  energyAfternoon: varchar('energy_afternoon', { length: 10 })
    .notNull()
    .default('medium'),
  energyEvening: varchar('energy_evening', { length: 10 })
    .notNull()
    .default('low'),
  energyNight: varchar('energy_night', { length: 10 }).notNull().default('low'),
  scheduleHardTasksInFocus: boolean('schedule_hard_tasks_in_focus')
    .notNull()
    .default(true),
  finishStartedFirst: boolean('finish_started_first').notNull().default(true),
  groupSimilarTasks: boolean('group_similar_tasks').notNull().default(true),
  bufferBeforeMeetings: boolean('buffer_before_meetings')
    .notNull()
    .default(true),
  bufferMinutes: integer('buffer_minutes').notNull().default(15),
  // Daily-capacity controls: how much real work a day can hold, protected
  // recovery/rest windows, and the emergency slack the planner always leaves.
  maxDailyWorkMinutes: integer('max_daily_work_minutes').notNull().default(480),
  emergencyBufferMinutes: integer('emergency_buffer_minutes')
    .notNull()
    .default(30),
  sleepStartTime: varchar('sleep_start_time', { length: 5 })
    .notNull()
    .default('23:00'),
  sleepEndTime: varchar('sleep_end_time', { length: 5 })
    .notNull()
    .default('07:00'),
  lunchStartTime: varchar('lunch_start_time', { length: 5 })
    .notNull()
    .default('13:00'),
  lunchEndTime: varchar('lunch_end_time', { length: 5 })
    .notNull()
    .default('13:45'),
  // Extra fixed windows the user is never available (e.g. commute, prayer,
  // gym): a JSON array of { start: 'HH:mm', end: 'HH:mm' }.
  unavailableHours: jsonb('unavailable_hours').notNull().default([]),
  note: varchar('note', { length: 1000 }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const plannerAcceptedPlans = pgTable(
  'planner_accepted_plans',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    date: varchar('date', { length: 10 }).notNull(),
    plan: jsonb('plan').notNull(),
    acceptedAt: timestamp('accepted_at').defaultNow().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    userDateUnique: uniqueIndex('planner_accepted_plans_user_date_idx').on(table.userId, table.date),
  }),
);

export const categories = pgTable('categories', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 120 }).notNull(),
  color: varchar('color', { length: 32 }),
  createdAt: createdAt(),
});

export const savedLocations = pgTable('saved_locations', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  latitude: decimal('latitude', { precision: 10, scale: 7 }).notNull(),
  longitude: decimal('longitude', { precision: 10, scale: 7 }).notNull(),
  radiusMeters: integer('radius_meters').notNull().default(100),
  createdAt: createdAt(),
});

export const tasks = pgTable(
  'tasks',
  {
    id: id(),
    // The task owner. Retained as `user_id` (not renamed to `owner_id`) so
    // every existing single-user query keeps working unchanged — a personal
    // task is simply a task whose owner has no other accepted members.
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Who originally created the task. Defaults to the owner and only differs
    // once ownership is transferred. Nullable for rows created before this
    // column existed (backfilled to `user_id` on boot).
    creatorId: uuid('creator_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    priority: varchar('priority', { length: 20 }).notNull().default('medium'),
    status: varchar('status', { length: 20 }).notNull().default('todo'),
    progress: integer('progress').notNull().default(0),
    dueDate: timestamp('due_date'),
    dueTime: varchar('due_time', { length: 20 }),
    categoryId: uuid('category_id').references(() => categories.id, {
      onDelete: 'set null',
    }),
    category: varchar('category', { length: 120 }),
    notes: text('notes'),
    estimatedTimeMinutes: integer('estimated_time_minutes')
      .notNull()
      .default(0),
    spentTimeMinutes: integer('spent_time_minutes').notNull().default(0),
    remainingTimeMinutes: integer('remaining_time_minutes')
      .notNull()
      .default(0),
    reminderEnabled: boolean('reminder_enabled').notNull().default(false),
    reminderBeforeMinutes: integer('reminder_before_minutes'),
    labels: jsonb('labels'),
    attachments: jsonb('attachments'),
    isFavorite: boolean('is_favorite').notNull().default(false),
    isFocusTask: boolean('is_focus_task').notNull().default(false),
    recurrenceRootId: uuid('recurrence_root_id').references(
      (): AnyPgColumn => tasks.id,
      { onDelete: 'set null' },
    ),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    // `findAll`/`findOne` and virtually every mutation filter by
    // (userId, id) or userId alone — this is the hottest lookup in the app.
    index('idx_tasks_user_id').on(table.userId),
    // Powers status filter tabs (All Tasks) and the dashboard summary counts.
    index('idx_tasks_status').on(table.status),
    // Powers "due today"/calendar/overdue filtering.
    index('idx_tasks_due_date').on(table.dueDate),
    // Powers the "High Priority" quick filter and priority filtering.
    index('idx_tasks_priority').on(table.priority),
    // Powers the Categories sidebar filter and category counts.
    index('idx_tasks_category').on(table.category),
    // Powers the "Focus Tasks" quick filter.
    index('idx_tasks_focus').on(table.isFocusTask),
    // Powers the "Has Reminder" filter.
    index('idx_tasks_reminder_enabled').on(table.reminderEnabled),
  ],
);

export const taskAttachments = pgTable(
  'task_attachments',
  {
    id: id(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    fileName: varchar('file_name', { length: 255 }).notNull(),
    storageKey: text('storage_key').notNull(),
    mimeType: varchar('mime_type', { length: 120 }).notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    createdAt: createdAt(),
  },
  (table) => [index('idx_task_attachments_task_id').on(table.taskId)],
);

export const subtasks = pgTable(
  'subtasks',
  {
    id: id(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 255 }).notNull(),
    // Kept in sync with `status === 'done'` for backward compatibility with
    // existing callers/UI that only toggle a checkbox.
    isDone: boolean('is_done').notNull().default(false),
    orderIndex: integer('order_index').notNull().default(0),
    assignee: varchar('assignee', { length: 80 }),
    // Structured link to the collaborator this subtask is assigned to (set by
    // the AI Collaboration Planner apply step, or manually). Nullable — most
    // subtasks have no assignee. `assignee` (free text) is kept in sync with
    // the assignee's display name for backward compatibility with UI that
    // only reads the string field.
    assigneeUserId: uuid('assignee_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    // Explicit shared/personal distinction (never inferred from the title). A
    // subtask is "shared" (team-wide) when isShared, "personal" when it has an
    // assigneeUserId, and "unassigned" otherwise. Set for genuinely shared
    // planner work (collapsed shared sessions) and manual shared subtasks.
    isShared: boolean('is_shared').notNull().default(false),
    description: text('description'),
    // low | medium | high | urgent
    priority: varchar('priority', { length: 20 }).notNull().default('medium'),
    // todo | in_progress | done | blocked | missed
    status: varchar('status', { length: 30 }).notNull().default('todo'),
    startDate: timestamp('start_date'),
    dueDate: timestamp('due_date'),
    estimatedDurationMinutes: integer('estimated_duration_minutes'),
    actualDurationMinutes: integer('actual_duration_minutes'),
    // 'user' when the estimate was entered by a person, 'ai' when inferred by
    // the planner — the UI shows an "AI Estimate" badge for the latter.
    estimatedDurationSource: varchar('estimated_duration_source', {
      length: 10,
    })
      .notNull()
      .default('user'),
    // Lightweight per-subtask reminder config. Not a standalone reminder
    // entity yet — future-ready to be promoted without a schema redesign.
    reminderEnabled: boolean('reminder_enabled').notNull().default(false),
    reminderMinutesBeforeDue: integer('reminder_minutes_before_due'),
    reminderTime: timestamp('reminder_time'),
    reminderSentAt: timestamp('reminder_sent_at'),
    // none | scheduled | sent | cancelled
    reminderStatus: varchar('reminder_status', { length: 20 })
      .notNull()
      .default('none'),
    notes: text('notes'),
    tags: jsonb('tags'),
    completedAt: timestamp('completed_at'),
    // --- AI Collaboration Planner provenance -------------------------------
    // Populated only for subtasks created by POST .../ai/collaboration-plan/apply.
    // Null for manually-created subtasks. Lets a later apply call identify and
    // replace its own prior output instead of appending duplicates, and lets
    // apply-time semantic dedup work off stable fields instead of title text.
    source: varchar('source', { length: 40 }),
    sourcePlanId: uuid('source_plan_id'),
    sourceProposalId: varchar('source_proposal_id', { length: 64 }),
    semanticType: varchar('semantic_type', { length: 30 }),
    subjectKeys: jsonb('subject_keys'),
    sharedSessionGroupId: varchar('shared_session_group_id', { length: 64 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('idx_subtasks_task_id').on(table.taskId),
    index('idx_subtasks_status').on(table.status),
    index('idx_subtasks_due_date').on(table.dueDate),
    index('idx_subtasks_assignee_user_id').on(table.assigneeUserId),
    index('idx_subtasks_task_source').on(table.taskId, table.source),
  ],
);

// Intra-task subtask ordering constraints: `subtaskId` cannot be started until
// `dependsOnSubtaskId` is complete. Both must belong to the same parent task
// (enforced in the service layer).
export const subtaskDependencies = pgTable(
  'subtask_dependencies',
  {
    subtaskId: uuid('subtask_id')
      .notNull()
      .references(() => subtasks.id, { onDelete: 'cascade' }),
    dependsOnSubtaskId: uuid('depends_on_subtask_id')
      .notNull()
      .references(() => subtasks.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.subtaskId, table.dependsOnSubtaskId] }),
  ],
);

export const subtaskAttachments = pgTable(
  'subtask_attachments',
  {
    id: id(),
    subtaskId: uuid('subtask_id')
      .notNull()
      .references(() => subtasks.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    fileName: varchar('file_name', { length: 255 }).notNull(),
    storageKey: text('storage_key').notNull(),
    mimeType: varchar('mime_type', { length: 120 }).notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    createdAt: createdAt(),
  },
  (table) => [index('idx_subtask_attachments_subtask_id').on(table.subtaskId)],
);

// Note: task_dependencies.taskId is already served by the composite primary
// key below (taskId, dependencyTaskId) — Postgres can use a multi-column
// btree index for lookups on just its leading column, so a separate index
// on taskId alone would only add write overhead with no read benefit.
export const taskDependencies = pgTable(
  'task_dependencies',
  {
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    dependencyTaskId: uuid('dependency_task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.taskId, table.dependencyTaskId] })],
);

export const taskRecurrenceRules = pgTable('task_recurrence_rules', {
  id: id(),
  taskId: uuid('task_id')
    .notNull()
    .unique()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  frequency: varchar('frequency', { length: 20 }).notNull().default('Never'),
  weekdays: jsonb('weekdays'),
  monthlyMode: varchar('monthly_mode', { length: 30 }),
  customInterval: integer('custom_interval').notNull().default(1),
  customUnit: varchar('custom_unit', { length: 20 }).notNull().default('weeks'),
  endType: varchar('end_type', { length: 20 }).notNull().default('never'),
  endDate: date('end_date'),
  occurrences: integer('occurrences'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const taskRecurrenceSuggestionDismissals = pgTable(
  'task_recurrence_suggestion_dismissals',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    suggestionId: varchar('suggestion_id', { length: 80 }).notNull(),
    taskTitle: varchar('task_title', { length: 255 }),
    dismissedAt: timestamp('dismissed_at').defaultNow().notNull(),
  },
  (table) => [
    index('task_recurrence_suggestion_dismissals_user_idx').on(table.userId),
    index('task_recurrence_suggestion_dismissals_suggestion_idx').on(
      table.suggestionId,
    ),
  ],
);

export const taskActivities = pgTable(
  'task_activities',
  {
    id: id(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    action: varchar('action', { length: 80 }).notNull(),
    description: text('description').notNull(),
    metadata: jsonb('metadata'),
    createdAt: createdAt(),
  },
  (table) => [
    index('idx_task_activities_task_created').on(table.taskId, table.createdAt),
  ],
);

export const focusSessions = pgTable(
  'focus_sessions',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Nullable so a session survives its task being deleted (kept for stats).
    taskId: uuid('task_id').references(() => tasks.id, {
      onDelete: 'set null',
    }),
    startedAt: timestamp('started_at').notNull().defaultNow(),
    endedAt: timestamp('ended_at'),
    plannedMinutes: integer('planned_minutes').notNull().default(25),
    actualMinutes: integer('actual_minutes'),
    // active | paused | completed | cancelled
    status: varchar('status', { length: 20 }).notNull().default('active'),
    // pomodoro | deep | long | break | custom
    sessionType: varchar('session_type', { length: 20 })
      .notNull()
      .default('pomodoro'),
    notes: text('notes'),
    createdAt: createdAt(),
  },
  (table) => [
    index('idx_focus_sessions_user_id').on(table.userId),
    index('idx_focus_sessions_started_at').on(table.startedAt),
    index('idx_focus_sessions_task_id').on(table.taskId),
  ],
);

export const reminders = pgTable(
  'reminders',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 255 }).notNull(),
    type: varchar('type', { length: 30 }).notNull().default('time'),
    triggerDateTime: timestamp('trigger_date_time'),
    reminderBefore: integer('reminder_before'),
    repeat: varchar('repeat', { length: 20 }).notNull().default('none'),
    repeatInterval: integer('repeat_interval'),
    repeatDaysOfWeek: jsonb('repeat_days_of_week'),
    repeatEndDate: timestamp('repeat_end_date'),
    notes: text('notes'),
    priority: varchar('priority', { length: 20 }).notNull().default('medium'),
    status: varchar('status', { length: 20 }).notNull().default('active'),
    // Optional link to a task. When set, the reminder is a task reminder.
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
    // 'personal' (default) — visible/firing only for `userId`. 'shared' — every
    // accepted member of `taskId` receives it. Non-task reminders are always
    // personal. See RemindersService and the collaboration notification fan-out.
    audience: varchar('audience', { length: 20 }).notNull().default('personal'),
    location: jsonb('location'),
    context: jsonb('context'),
    checklistItems: jsonb('checklist_items'),
    // Config for `type = 'person'` proximity reminders. Shape:
    // { targetUserId, targetName, message, radiusMeters, cooldownMinutes,
    //   permissionId, lastNotifiedAt }. `lastNotifiedAt` is stamped server-side
    //   by the nearby check to enforce the notification cooldown. Null for all
    //   non-person reminder types. See src/social/person-reminders.service.ts.
    person: jsonb('person'),
    // True when `userId` is null - i.e. this row predates auth being
    // required on reminder creation and has no determinable owner. Kept
    // instead of deleted so the data isn't lost; see DatabaseService.
    isOrphaned: boolean('is_orphaned').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('idx_reminders_user_status').on(table.userId, table.status),
    index('idx_reminders_task_id').on(table.taskId),
  ],
);

export const habits = pgTable('habits', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  frequency: varchar('frequency', { length: 20 }).notNull(),
  targetCount: integer('target_count').notNull().default(1),
  reminderTime: time('reminder_time'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: createdAt(),
});

export const habitLogs = pgTable('habit_logs', {
  id: id(),
  habitId: uuid('habit_id')
    .notNull()
    .references(() => habits.id, { onDelete: 'cascade' }),
  logDate: date('log_date').notNull(),
  completedCount: integer('completed_count').notNull().default(0),
  isCompleted: boolean('is_completed').notNull().default(false),
});

export const courses = pgTable('courses', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  color: varchar('color', { length: 32 }),
  description: text('description'),
});

export const exams = pgTable('exams', {
  id: id(),
  courseId: uuid('course_id')
    .notNull()
    .references(() => courses.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  examDate: timestamp('exam_date').notNull(),
  notes: text('notes'),
});

export const assignments = pgTable('assignments', {
  id: id(),
  courseId: uuid('course_id')
    .notNull()
    .references(() => courses.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  dueDate: timestamp('due_date').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('todo'),
  grade: decimal('grade', { precision: 5, scale: 2 }),
});

export const studySessions = pgTable('study_sessions', {
  id: id(),
  courseId: uuid('course_id')
    .notNull()
    .references(() => courses.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  startTime: timestamp('start_time').notNull(),
  endTime: timestamp('end_time').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('planned'),
});

export const shoppingLists = pgTable('shopping_lists', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  storeName: varchar('store_name', { length: 255 }),
  locationId: uuid('location_id').references(() => savedLocations.id, {
    onDelete: 'set null',
  }),
});

export const shoppingItems = pgTable('shopping_items', {
  id: id(),
  listId: uuid('list_id')
    .notNull()
    .references(() => shoppingLists.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  quantity: integer('quantity').notNull().default(1),
  isDone: boolean('is_done').notNull().default(false),
});

export const goals = pgTable('goals', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  targetDate: date('target_date'),
  progress: integer('progress').notNull().default(0),
  status: varchar('status', { length: 20 }).notNull().default('active'),
});

export const goalTasks = pgTable(
  'goal_tasks',
  {
    goalId: uuid('goal_id')
      .notNull()
      .references(() => goals.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.goalId, table.taskId] })],
);

export const groups = pgTable('groups', {
  id: id(),
  name: varchar('name', { length: 255 }).notNull(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: createdAt(),
});

export const groupMembers = pgTable('group_members', {
  id: id(),
  groupId: uuid('group_id')
    .notNull()
    .references(() => groups.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 20 }).notNull().default('member'),
});

export const sharedTasks = pgTable('shared_tasks', {
  id: id(),
  taskId: uuid('task_id')
    .notNull()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  groupId: uuid('group_id')
    .notNull()
    .references(() => groups.id, { onDelete: 'cascade' }),
  assignedTo: uuid('assigned_to').references(() => users.id, {
    onDelete: 'set null',
  }),
});

export const notifications = pgTable(
  'notifications',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reminderId: uuid('reminder_id').references(() => reminders.id, {
      onDelete: 'set null',
    }),
    // Collaboration notifications reference the task they concern and the user
    // who triggered them; `data` carries a client action payload
    // (e.g. { commentId, memberId, invitationId } for deep-linking / buttons).
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    data: jsonb('data'),
    title: varchar('title', { length: 255 }).notNull(),
    body: text('body').notNull(),
    notificationType: varchar('notification_type', { length: 50 }).notNull(),
    isRead: boolean('is_read').notNull().default(false),
    sentAt: timestamp('sent_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_notifications_user_unread').on(table.userId, table.isRead),
    index('idx_notifications_sent_at').on(table.sentAt),
  ],
);

// The standing AI project manager's recommendation cards. See
// AiRecommendationsService for detection heuristics and DatabaseService's
// ensureAiRecommendationsTable for the runtime DDL (incl. the partial unique
// index on (taskId, dedupeKey) that dedupes pending cards).
export const aiRecommendations = pgTable(
  'ai_recommendations',
  {
    id: id(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    // ahead_of_pace | inactive_member | deadline_risk | workload_imbalance
    kind: varchar('kind', { length: 40 }).notNull(),
    // pending | approved | dismissed | auto_resolved
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    targetUserId: uuid('target_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    title: varchar('title', { length: 255 }).notNull(),
    message: text('message').notNull(),
    reason: text('reason').notNull(),
    payload: jsonb('payload').notNull().default({}),
    dedupeKey: varchar('dedupe_key', { length: 160 }).notNull(),
    createdAt: createdAt(),
    resolvedAt: timestamp('resolved_at'),
    resolvedByUserId: uuid('resolved_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [index('idx_ai_reco_task').on(table.taskId, table.createdAt)],
);

export const deviceTokens = pgTable('device_tokens', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull(),
  platform: varchar('platform', { length: 20 }).notNull(),
  createdAt: createdAt(),
});

// A directional friend request that becomes a mutual friendship once accepted.
// `requesterId` sent the request to `addresseeId`. Uniqueness is enforced on
// the ordered pair; the service also blocks a reverse-direction duplicate.
export const friendships = pgTable(
  'friendships',
  {
    id: id(),
    requesterId: uuid('requester_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    addresseeId: uuid('addressee_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // pending | accepted | rejected
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('idx_friendships_requester').on(table.requesterId),
    index('idx_friendships_addressee').on(table.addresseeId),
  ],
);

// Consent for one user (`ownerId`, who shares their location) to have their
// proximity observed by another (`viewerId`, who created a person reminder).
// Default mode is proximity-only: the viewer never sees the owner's exact
// coordinates. The owner accepts/rejects and can revoke at any time.
export const locationSharingPermissions = pgTable(
  'location_sharing_permissions',
  {
    id: id(),
    // The friend who agrees to share their location.
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // The user who gets notified when they are near the owner.
    viewerId: uuid('viewer_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // proximity | live_location  (live_location reserved; never exposes coords yet)
    mode: varchar('mode', { length: 20 }).notNull().default('proximity'),
    // pending | active | rejected | revoked | expired
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    // Null means "always" (no expiration).
    expiresAt: timestamp('expires_at'),
    respondedAt: timestamp('responded_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('idx_location_sharing_owner').on(table.ownerId),
    index('idx_location_sharing_viewer').on(table.viewerId),
  ],
);

// Latest known coarse location per user (one upserted row each). Only used to
// compute proximity between consenting users; never returned to clients as
// coordinates. Written only while the user has an active person reminder.
export const userLocationSnapshots = pgTable('user_location_snapshots', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  latitude: decimal('latitude', { precision: 10, scale: 7 }).notNull(),
  longitude: decimal('longitude', { precision: 10, scale: 7 }).notNull(),
  accuracyMeters: integer('accuracy_meters'),
  capturedAt: timestamp('captured_at').defaultNow().notNull(),
  updatedAt: updatedAt(),
});

export const dailyUserStats = pgTable('daily_user_stats', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  date: date('date').notNull(),
  completedTasks: integer('completed_tasks').notNull().default(0),
  missedTasks: integer('missed_tasks').notNull().default(0),
  completedHabits: integer('completed_habits').notNull().default(0),
  missedReminders: integer('missed_reminders').notNull().default(0),
});

// ---------------------------------------------------------------------------
// Collaborative (shared) tasks
// ---------------------------------------------------------------------------

// One row per (task, user) collaboration link. A `pending` row IS the pending
// invitation — there is no separate invitations table, which keeps a single
// source of truth for "who is on this task and in what state". The task owner
// always has an implicit owner role via tasks.userId and is NOT required to
// have a row here (though a row may exist after an ownership transfer).
export const taskMembers = pgTable(
  'task_members',
  {
    id: id(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // owner | editor | viewer
    role: varchar('role', { length: 20 }).notNull().default('viewer'),
    // pending | accepted | declined
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    invitedById: uuid('invited_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    invitedAt: timestamp('invited_at').defaultNow().notNull(),
    acceptedAt: timestamp('accepted_at'),
    joinedAt: timestamp('joined_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    // A user can appear at most once per task; also blocks duplicate invites.
    uniqueIndex('uq_task_members_task_user').on(table.taskId, table.userId),
    // "members of this task" lookups (task details, notification fan-out).
    index('idx_task_members_task').on(table.taskId),
    // "tasks shared with me" lookups (dashboard/all-tasks visibility, invites).
    index('idx_task_members_user').on(table.userId),
    index('idx_task_members_status').on(table.status),
    index('idx_task_members_task_status').on(table.taskId, table.status),
    index('idx_task_members_user_status').on(table.userId, table.status),
  ],
);

export const taskComments = pgTable(
  'task_comments',
  {
    id: id(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    message: text('message').notNull(),
    // Set on first edit; null means never edited.
    editedAt: timestamp('edited_at'),
    // Soft delete so mention notifications / activity keep referential context.
    deletedAt: timestamp('deleted_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('idx_task_comments_task').on(table.taskId),
    index('idx_task_comments_created').on(table.createdAt),
  ],
);

export const taskCommentMentions = pgTable(
  'task_comment_mentions',
  {
    id: id(),
    commentId: uuid('comment_id')
      .notNull()
      .references(() => taskComments.id, { onDelete: 'cascade' }),
    mentionedUserId: uuid('mentioned_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('uq_task_comment_mentions').on(
      table.commentId,
      table.mentionedUserId,
    ),
    index('idx_task_comment_mentions_user').on(table.mentionedUserId),
  ],
);

// Per-user, per-task settings that must NEVER be shared across collaborators:
// pin, favorite, focus-queue membership, and personal reminder/notification
// preferences. One row per (task, user); created lazily on first write.
export const personalTaskPreferences = pgTable(
  'personal_task_preferences',
  {
    id: id(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    isPinned: boolean('is_pinned').notNull().default(false),
    isFavorite: boolean('is_favorite').notNull().default(false),
    isFocusQueued: boolean('is_focus_queued').notNull().default(false),
    // Per-user override for the task reminder lead time (minutes). Null = use
    // the task's shared reminder settings.
    personalReminderMinutesBefore: integer('personal_reminder_minutes_before'),
    // Per-user mute of collaboration notifications for this task.
    notificationsMuted: boolean('notifications_muted').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('uq_personal_task_prefs').on(table.taskId, table.userId),
    index('idx_personal_task_prefs_user').on(table.userId),
  ],
);
