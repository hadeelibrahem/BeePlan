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
  real,
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

export const users = pgTable(
  'users',
  {
    id: id(),
    fullName: varchar('full_name', { length: 255 }).notNull(),
    username: varchar('username', { length: 20 }).notNull(),
    usernameNormalized: varchar('username_normalized', {
      length: 20,
    }).notNull(),
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
  },
  (table) => ({
    usernameNormalizedUnique: uniqueIndex(
      'users_username_normalized_unique',
    ).on(table.usernameNormalized),
  }),
);

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

export const whiteboards = pgTable('whiteboards', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 })
    .notNull()
    .default('Personal Whiteboard'),
  snapshot: jsonb('snapshot'),
  assetReferences: jsonb('asset_references').notNull().default({}),
  cameraX: real('camera_x').notNull().default(0),
  cameraY: real('camera_y').notNull().default(0),
  cameraZoom: real('camera_zoom').notNull().default(1),
  previewUrl: text('preview_url'),
  isPinned: boolean('is_pinned').notNull().default(false),
  isArchived: boolean('is_archived').notNull().default(false),
  lastOpenedAt: timestamp('last_opened_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const whiteboardAssets = pgTable(
  'whiteboard_assets',
  {
    id: id(),
    whiteboardId: uuid('whiteboard_id')
      .notNull()
      .references(() => whiteboards.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 16 }).notNull(),
    fileName: varchar('file_name', { length: 255 }).notNull(),
    storagePath: text('storage_path').notNull(),
    mimeType: varchar('mime_type', { length: 160 }).notNull(),
    size: integer('size').notNull(),
    width: integer('width'),
    height: integer('height'),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at'),
  },
  (table) => [
    index('idx_whiteboard_assets_whiteboard_id').on(table.whiteboardId),
    index('idx_whiteboard_assets_user_id').on(table.userId),
  ],
);

export const whiteboardMembers = pgTable(
  'whiteboard_members',
  {
    id: id(),
    boardId: uuid('board_id').notNull().references(() => whiteboards.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 10 }).notNull().default('owner'),
    invitedBy: uuid('invited_by').references(() => users.id, { onDelete: 'set null' }),
    acceptedAt: timestamp('accepted_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('uq_whiteboard_members_board_user').on(table.boardId, table.userId),
    index('idx_whiteboard_members_user').on(table.userId),
    index('idx_whiteboard_members_board').on(table.boardId),
  ],
);

export const whiteboardInvitations = pgTable(
  'whiteboard_invitations',
  {
    id: id(),
    boardId: uuid('board_id').notNull().references(() => whiteboards.id, { onDelete: 'cascade' }),
    emailNormalized: varchar('email_normalized', { length: 255 }).notNull(),
    invitedUserId: uuid('invited_user_id').references(() => users.id, { onDelete: 'set null' }),
    role: varchar('role', { length: 10 }).notNull(),
    invitedBy: uuid('invited_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    status: varchar('status', { length: 10 }).notNull().default('pending'),
    expiresAt: timestamp('expires_at').notNull(),
    acceptedAt: timestamp('accepted_at'),
    revokedAt: timestamp('revoked_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('idx_whiteboard_invitations_board').on(table.boardId),
    index('idx_whiteboard_invitations_email').on(table.emailNormalized),
  ],
);

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
    userDateUnique: uniqueIndex('planner_accepted_plans_user_date_idx').on(
      table.userId,
      table.date,
    ),
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

// A user's permanent "saved place" (Home, University, Work, Gym...). Doubles as
// the canonical target every place alias resolves to, and as an optional
// location for a recurring commitment. Previously an unused base table; extended
// with icon/address/category/updatedAt for the Personal Context feature so the
// app never needs a second place model (reminders keep their inline jsonb
// location — see reminders.location).
export const savedLocations = pgTable(
  'saved_locations',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // The short canonical label shown in the row, e.g. "Home", "University".
    name: varchar('name', { length: 255 }).notNull(),
    // Optional emoji/icon for the row (e.g. "🏠").
    icon: varchar('icon', { length: 16 }),
    // Human-readable address / location value, e.g. "Tubas, Palestine".
    address: text('address'),
    // Optional link to a smart place category (home/work/university/gym/...) so
    // the AI can resolve a canonical place to a category and back. Mirrors the
    // client GeneralLocationCategory / REMINDER_PLACE_CATEGORIES list.
    category: varchar('category', { length: 80 }),
    latitude: decimal('latitude', { precision: 10, scale: 7 }).notNull(),
    longitude: decimal('longitude', { precision: 10, scale: 7 }).notNull(),
    radiusMeters: integer('radius_meters').notNull().default(100),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('idx_saved_locations_user').on(table.userId)],
);

// Natural-language names ("home", "البيت", "campus", "الجامعة") that resolve to
// a canonical savedLocation. Scoped to the user; a given normalized alias maps
// to at most one place per user (enforced by the unique index) so AI resolution
// is deterministic.
export const savedLocationAliases = pgTable(
  'saved_location_aliases',
  {
    id: id(),
    savedLocationId: uuid('saved_location_id')
      .notNull()
      .references(() => savedLocations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // The alias exactly as the user typed it (for display).
    alias: varchar('alias', { length: 120 }).notNull(),
    // Lowercased/diacritic-stripped form used for matching (incl. Arabic).
    normalizedAlias: varchar('normalized_alias', { length: 120 }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('uq_saved_location_alias_user').on(
      table.userId,
      table.normalizedAlias,
    ),
    index('idx_saved_location_aliases_location').on(table.savedLocationId),
  ],
);

// A recurring, fixed weekly commitment (e.g. "University Classes", Mon/Tue/Wed
// 08:00–11:00). The AI planner treats an active commitment whose weekday matches
// the plan date as a HARD busy interval — no task/focus/study block may overlap
// it. Times are the user's local wall-clock (same convention as
// plannerPreferences sleep/lunch/unavailableHours).
export const recurringCommitments = pgTable(
  'recurring_commitments',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 255 }).notNull(),
    // JSON array of weekday numbers, 0 = Sunday .. 6 = Saturday (JS getDay()).
    daysOfWeek: jsonb('days_of_week').notNull().default([]),
    startTime: varchar('start_time', { length: 5 }).notNull(), // HH:mm
    endTime: varchar('end_time', { length: 5 }).notNull(), // HH:mm
    // Optional place this commitment happens at.
    savedLocationId: uuid('saved_location_id').references(
      () => savedLocations.id,
      { onDelete: 'set null' },
    ),
    repeatWeekly: boolean('repeat_weekly').notNull().default(true),
    // Optional bounds — the commitment only applies within [startDate, endDate].
    startDate: date('start_date'),
    endDate: date('end_date'),
    // When false the commitment is temporarily disabled (ignored by the planner).
    isActive: boolean('is_active').notNull().default(true),
    notes: text('notes'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('idx_recurring_commitments_user').on(table.userId)],
);

export const skippedCommitmentOccurrences = pgTable(
  'skipped_commitment_occurrences',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    commitmentId: uuid('commitment_id')
      .notNull()
      .references(() => recurringCommitments.id, { onDelete: 'cascade' }),
    date: varchar('date', { length: 10 }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('skipped_commitment_occurrences_unique').on(
      table.userId,
      table.commitmentId,
      table.date,
    ),
    index('idx_skipped_commitment_occurrences_user_date').on(
      table.userId,
      table.date,
    ),
  ],
);

export const scheduleConflictResolutions = pgTable(
  'schedule_conflict_resolutions',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    conflictKey: varchar('conflict_key', { length: 500 }).notNull(),
    date: varchar('date', { length: 10 }).notNull(),
    taskId: uuid('task_id'),
    commitmentId: uuid('commitment_id').references(
      () => recurringCommitments.id,
      { onDelete: 'cascade' },
    ),
    resolution: varchar('resolution', { length: 40 }).notNull(),
    resolvedAt: timestamp('resolved_at').defaultNow().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('schedule_conflict_resolutions_user_key').on(
      table.userId,
      table.conflictKey,
    ),
    index('idx_schedule_conflict_resolutions_user_date').on(
      table.userId,
      table.date,
    ),
  ],
);

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
    scheduledDate: varchar('scheduled_date', { length: 10 }),
    scheduledStartTime: varchar('scheduled_start_time', { length: 5 }),
    scheduledEndTime: varchar('scheduled_end_time', { length: 5 }),
    destination: jsonb('destination'),
    weatherTravelEnabled: boolean('weather_travel_enabled')
      .notNull()
      .default(false),
    travelMode: varchar('travel_mode', { length: 24 }),
    travelOriginPreference: jsonb('travel_origin_preference'),
    categoryId: uuid('category_id').references(() => categories.id, {
      onDelete: 'set null',
    }),
    category: varchar('category', { length: 120 }),
    notes: text('notes'),
    estimatedTimeMinutes: integer('estimated_time_minutes')
      .notNull()
      .default(0),
    // Total time spent, DERIVED as manualSpentMinutes + sum of the task's
    // completed Focus Session minutes. A cache — never edited directly; both
    // TasksService (manual writes) and FocusService (session finish/cancel)
    // recompute it via TasksService.recomputeTaskSpentTime.
    spentTimeMinutes: integer('spent_time_minutes').notNull().default(0),
    // Time the user logged by hand (Edit Task "Spent hours" / time-estimation).
    // The manual half of the spent-time model; preserved independently of Focus
    // Sessions so focus recomputes never discard hand-entered time.
    manualSpentMinutes: integer('manual_spent_minutes').notNull().default(0),
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
    // Explicit deep-work eligibility flag, mirroring tasks.isFocusTask. When
    // true (and the subtask is incomplete + unblocked) the subtask is eligible
    // for the Focus queue and "Do This Now" selection, and a Focus session may
    // attach to it directly. Never inferred from duration, title, or AI.
    isFocusTask: boolean('is_focus_task').notNull().default(false),
    description: text('description'),
    // low | medium | high | urgent
    priority: varchar('priority', { length: 20 }).notNull().default('medium'),
    // todo | in_progress | done | blocked | missed
    status: varchar('status', { length: 30 }).notNull().default('todo'),
    startDate: timestamp('start_date'),
    dueDate: timestamp('due_date'),
    scheduledDate: varchar('scheduled_date', { length: 10 }),
    scheduledStartTime: varchar('scheduled_start_time', { length: 5 }),
    scheduledEndTime: varchar('scheduled_end_time', { length: 5 }),
    destination: jsonb('destination'),
    weatherTravelEnabled: boolean('weather_travel_enabled')
      .notNull()
      .default(false),
    travelMode: varchar('travel_mode', { length: 24 }),
    travelOriginPreference: jsonb('travel_origin_preference'),
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
    // Powers focus-eligible subtask selection for the Focus queue / recommender.
    index('idx_subtasks_focus').on(table.isFocusTask),
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
    // Optional link to the specific subtask being worked on. Null for
    // task-level sessions (today's behavior) and for sessions whose subtask was
    // later deleted. When set, the session targets the smallest work unit while
    // taskId is retained as context. Both survive their referents' deletion so
    // historical analytics never break.
    subtaskId: uuid('subtask_id').references(() => subtasks.id, {
      onDelete: 'set null',
    }),
    startedAt: timestamp('started_at').notNull().defaultNow(),
    endedAt: timestamp('ended_at'),
    // Authoritative scheduled end of the session (started_at + planned time,
    // pushed out by "Add More Time" extensions). Nullable for rows created
    // before this column existed; the service derives a fallback from
    // started_at + planned_minutes when absent.
    endsAt: timestamp('ends_at'),
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
    // Powers the subtask actual-time rollup (sum of completed sessions).
    index('idx_focus_sessions_subtask_id').on(table.subtaskId),
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
    smartLocationEnabled: boolean('smart_location_enabled')
      .notNull()
      .default(false),
    smartPlaceCategory: varchar('smart_place_category', { length: 80 }),
    triggerRadius: integer('trigger_radius').notNull().default(200),
    triggerOnEnter: boolean('trigger_on_enter').notNull().default(true),
    triggerCooldown: integer('trigger_cooldown').notNull().default(1440),
    lastTriggeredAt: timestamp('last_triggered_at'),
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

export const weatherTravelPreferences = pgTable('weather_travel_preferences', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  enabled: boolean('enabled').notNull().default(false),
  defaultTravelMode: varchar('default_travel_mode', { length: 24 })
    .notNull()
    .default('driving'),
  homeRadiusMeters: integer('home_radius_meters').notNull().default(100),
  preparationBufferMinutes: integer('preparation_buffer_minutes')
    .notNull()
    .default(10),
  parkingWalkingBufferMinutes: integer('parking_walking_buffer_minutes')
    .notNull()
    .default(0),
  uncertaintyBufferMinutes: integer('uncertainty_buffer_minutes')
    .notNull()
    .default(5),
  weatherLeadMinutes: integer('weather_lead_minutes').notNull().default(15),
  currentLocationFreshnessMinutes: integer('current_location_freshness_minutes')
    .notNull()
    .default(30),
  coldThresholdC: decimal('cold_threshold_c', { precision: 5, scale: 2 })
    .notNull()
    .default('12'),
  veryColdThresholdC: decimal('very_cold_threshold_c', {
    precision: 5,
    scale: 2,
  })
    .notNull()
    .default('5'),
  hotThresholdC: decimal('hot_threshold_c', { precision: 5, scale: 2 })
    .notNull()
    .default('28'),
  extremeHeatThresholdC: decimal('extreme_heat_threshold_c', {
    precision: 5,
    scale: 2,
  })
    .notNull()
    .default('35'),
  rainThresholdPercent: integer('rain_threshold_percent').notNull().default(50),
  rainAmountThresholdMm: decimal('rain_amount_threshold_mm', {
    precision: 6,
    scale: 2,
  })
    .notNull()
    .default('0.5'),
  windThresholdKph: decimal('wind_threshold_kph', { precision: 6, scale: 2 })
    .notNull()
    .default('35'),
  uvThreshold: decimal('uv_threshold', { precision: 5, scale: 2 })
    .notNull()
    .default('6'),
  visibilityThresholdMeters: integer('visibility_threshold_meters')
    .notNull()
    .default(1000),
  advice: jsonb('advice').notNull().default({
    coat: true,
    lightClothing: true,
    umbrella: true,
    hydration: true,
    uv: true,
    wind: true,
    severeWeather: true,
  }),
  currentLocationFallbackEnabled: boolean('current_location_fallback_enabled')
    .notNull()
    .default(false),
  approximateTravelFallbackEnabled: boolean(
    'approximate_travel_fallback_enabled',
  )
    .notNull()
    .default(true),
  aiPolishingEnabled: boolean('ai_polishing_enabled').notNull().default(false),
  language: varchar('language', { length: 8 }).notNull().default('en'),
  timezone: varchar('timezone', { length: 100 }).notNull().default('UTC'),
  selectedOriginSavedPlaceId: uuid('selected_origin_saved_place_id').references(
    () => savedLocations.id,
    { onDelete: 'set null' },
  ),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const taskWeatherNotifications = pgTable(
  'task_weather_notifications',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
    subtaskId: uuid('subtask_id').references(() => subtasks.id, {
      onDelete: 'cascade',
    }),
    fingerprint: varchar('fingerprint', { length: 128 }).notNull(),
    scheduleVersion: varchar('schedule_version', { length: 160 }).notNull(),
    originSource: varchar('origin_source', { length: 40 }).notNull(),
    originSummary: jsonb('origin_summary'),
    destinationSummary: jsonb('destination_summary').notNull(),
    scheduledTaskTime: timestamp('scheduled_task_time').notNull(),
    distanceMeters: integer('distance_meters'),
    routeDurationMinutes: integer('route_duration_minutes'),
    travelMode: varchar('travel_mode', { length: 24 }).notNull(),
    fallbackUsed: boolean('fallback_used').notNull().default(false),
    recommendedDepartureTime: timestamp('recommended_departure_time'),
    notificationTime: timestamp('notification_time').notNull(),
    recommendationTypes: jsonb('recommendation_types').notNull().default([]),
    deterministicMessage: text('deterministic_message').notNull(),
    polishedMessage: text('polished_message'),
    weatherEvidence: jsonb('weather_evidence'),
    payload: jsonb('payload').notNull().default({}),
    status: varchar('status', { length: 24 }).notNull().default('pending'),
    retryCount: integer('retry_count').notNull().default(0),
    lastErrorCode: varchar('last_error_code', { length: 80 }),
    deliveredAt: timestamp('delivered_at'),
    cancelledAt: timestamp('cancelled_at'),
    invalidatedAt: timestamp('invalidated_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('uq_task_weather_notifications_fingerprint').on(
      table.fingerprint,
    ),
    index('idx_task_weather_notifications_upcoming').on(
      table.status,
      table.notificationTime,
    ),
    index('idx_task_weather_notifications_user').on(table.userId),
    index('idx_task_weather_notifications_task').on(table.taskId),
    index('idx_task_weather_notifications_subtask').on(table.subtaskId),
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
    // Why the card left "pending" — see RESOLUTION_REASONS in
    // recommendation-validation.logic.ts. Null for user-driven approve/dismiss.
    resolutionReason: varchar('resolution_reason', { length: 40 }),
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

export const plannerDailySelections = pgTable(
  'planner_daily_selections',
  {
    id: id(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    plannerDate: varchar('planner_date', { length: 10 }).notNull(),
    taskId: uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
    subtaskId: uuid('subtask_id').references(() => subtasks.id, { onDelete: 'cascade' }),
    selectionSource: varchar('selection_source', { length: 20 }).notNull().default('user'),
    selectedAt: timestamp('selected_at').defaultNow().notNull(),
    removedAt: timestamp('removed_at'),
    plannerRunId: uuid('planner_run_id'),
  },
  (table) => [
    uniqueIndex('planner_daily_selections_unique').on(table.userId, table.plannerDate, table.taskId, table.subtaskId),
    index('planner_daily_selections_user_date').on(table.userId, table.plannerDate),
  ],
);

// Durable producer idempotency. A worker may run on several API instances and
// may safely retry the same event without creating duplicate inbox rows.
export const notificationDeliveries = pgTable(
  'notification_deliveries',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    notificationType: varchar('notification_type', { length: 50 }).notNull(),
    entityType: varchar('entity_type', { length: 50 }).notNull(),
    entityId: varchar('entity_id', { length: 255 }).notNull(),
    triggerAt: timestamp('trigger_at').notNull(),
    deliveryKey: varchar('delivery_key', { length: 500 }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('uq_notification_deliveries_key').on(table.deliveryKey),
    index('idx_notification_deliveries_entity').on(
      table.entityType,
      table.entityId,
    ),
  ],
);

// Durable, explainable notifications emitted by the proactive AI Task Manager.
// This is intentionally separate from the activity inbox: lifecycle actions
// (snooze/dismiss/action) and dedupe state must survive presentation changes.
export const aiTaskManagerNotifications = pgTable(
  'ai_task_manager_notifications',
  {
    id: id(),
    taskId: uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
    subtaskId: uuid('subtask_id').references(() => subtasks.id, { onDelete: 'cascade' }),
    recipientUserId: uuid('recipient_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    notificationType: varchar('notification_type', { length: 50 }).notNull(),
    severity: varchar('severity', { length: 20 }).notNull().default('info'),
    title: varchar('title', { length: 255 }).notNull(),
    summary: text('summary').notNull(),
    explanation: text('explanation').notNull(),
    evidence: jsonb('evidence').notNull().default([]),
    confidence: integer('confidence').notNull().default(80),
    recommendedAction: jsonb('recommended_action').notNull().default({}),
    fingerprint: varchar('fingerprint', { length: 255 }).notNull().unique(),
    status: varchar('status', { length: 20 }).notNull().default('unread'),
    readAt: timestamp('read_at'),
    dismissedAt: timestamp('dismissed_at'),
    snoozedUntil: timestamp('snoozed_until'),
    actionedAt: timestamp('actioned_at'),
    expiresAt: timestamp('expires_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('idx_ai_tm_recipient_status').on(table.recipientUserId, table.status),
    index('idx_ai_tm_task').on(table.taskId),
    index('idx_ai_tm_created').on(table.createdAt),
    index('idx_ai_tm_fingerprint').on(table.fingerprint),
  ],
);

export const achievements = pgTable(
  'achievements',
  {
    id: id(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    reflection: text('reflection'),
    achievementDate: date('achievement_date').notNull(),
    category: varchar('category', { length: 40 }).notNull().default('Other'),
    relatedTaskId: uuid('related_task_id').references(() => tasks.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('idx_achievements_user_date').on(table.userId, table.achievementDate),
    index('idx_achievements_user_category').on(table.userId, table.category),
  ],
);

export const achievementImages = pgTable(
  'achievement_images',
  {
    id: id(),
    achievementId: uuid('achievement_id').notNull().references(() => achievements.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    fileName: varchar('file_name', { length: 255 }).notNull(),
    storageKey: text('storage_key').notNull(),
    mimeType: varchar('mime_type', { length: 120 }).notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    isCover: boolean('is_cover').notNull().default(false),
    createdAt: createdAt(),
  },
  (table) => [index('idx_achievement_images_achievement').on(table.achievementId)],
);

export const userPushDevices = pgTable(
  'user_push_devices',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expoPushToken: varchar('expo_push_token', { length: 255 })
      .notNull()
      .unique(),
    platform: varchar('platform', { length: 20 }).notNull(),
    installationId: varchar('installation_id', { length: 255 }).notNull(),
    deviceName: varchar('device_name', { length: 255 }),
    appVersion: varchar('app_version', { length: 40 }),
    enabled: boolean('enabled').notNull().default(true),
    lastSeenAt: timestamp('last_seen_at').defaultNow().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('uq_user_push_devices_user_installation').on(
      table.userId,
      table.installationId,
    ),
    index('idx_user_push_devices_user_enabled').on(table.userId, table.enabled),
  ],
);

export const pushNotificationJobs = pgTable(
  'push_notification_jobs',
  {
    id: id(),
    notificationId: uuid('notification_id')
      .notNull()
      .references(() => notifications.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => userPushDevices.id, { onDelete: 'cascade' }),
    expoPushToken: varchar('expo_push_token', { length: 255 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    body: text('body').notNull(),
    payload: jsonb('payload').notNull().default({}),
    priority: varchar('priority', { length: 12 }).notNull().default('normal'),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    attemptCount: integer('attempt_count').notNull().default(0),
    nextRetryAt: timestamp('next_retry_at').defaultNow().notNull(),
    ticketId: varchar('ticket_id', { length: 255 }),
    lastError: text('last_error'),
    sentAt: timestamp('sent_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('uq_push_jobs_notification_device').on(
      table.notificationId,
      table.deviceId,
    ),
    index('idx_push_jobs_due').on(table.status, table.nextRetryAt),
    index('idx_push_jobs_receipts').on(table.status, table.updatedAt),
  ],
);

// Google Calendar is deliberately modeled separately from tasks and reminders.
// External ids/etags are the idempotency boundary for two-way sync; the raw
// payload keeps recurrence, attendees, timezone, and provider-specific fields.
export const googleCalendarConnections = pgTable(
  'google_calendar_connections',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountEmail: varchar('account_email', { length: 255 }).notNull(),
    accessToken: text('access_token').notNull(),
    refreshToken: text('refresh_token'),
    tokenExpiresAt: timestamp('token_expires_at'),
    syncDirection: varchar('sync_direction', { length: 20 })
      .notNull()
      .default('two_way'),
    defaultReminderMinutes: integer('default_reminder_minutes')
      .notNull()
      .default(10),
    syncTasks: boolean('sync_tasks').notNull().default(true),
    syncFocusSessions: boolean('sync_focus_sessions').notNull().default(true),
    syncReminders: boolean('sync_reminders').notNull().default(false),
    syncCalendarBlocks: boolean('sync_calendar_blocks').notNull().default(true),
    lastSyncedAt: timestamp('last_synced_at'),
    syncCursor: text('sync_cursor'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
);

export const userNotificationPreferences = pgTable(
  'user_notification_preferences',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    taskNotifications: boolean('task_notifications').notNull().default(true),
    calendarNotifications: boolean('calendar_notifications')
      .notNull()
      .default(true),
    focusNotifications: boolean('focus_notifications').notNull().default(true),
    collaborationNotifications: boolean('collaboration_notifications')
      .notNull()
      .default(true),
    aiNotifications: boolean('ai_notifications').notNull().default(true),
    emailNotifications: boolean('email_notifications').notNull().default(false),
    pushNotifications: boolean('push_notifications').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
);

export const googleCalendars = pgTable(
  'google_calendars',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id').references(
      () => googleCalendarConnections.id,
      { onDelete: 'cascade' },
    ),
    externalId: varchar('external_id', { length: 255 }).notNull(),
    summary: varchar('summary', { length: 255 }).notNull(),
    description: text('description'),
    timezone: varchar('timezone', { length: 100 }),
    color: varchar('color', { length: 32 }),
    selected: boolean('selected').notNull().default(false),
    nextSyncToken: text('next_sync_token'),
    lastSuccessfulSyncAt: timestamp('last_successful_sync_at'),
    lastFullSyncAt: timestamp('last_full_sync_at'),
    syncStatus: varchar('sync_status', { length: 20 })
      .notNull()
      .default('idle'),
    lastSyncError: text('last_sync_error'),
    syncLeaseUntil: timestamp('sync_lease_until'),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('uq_google_calendars_user_external').on(
      table.userId,
      table.externalId,
    ),
  ],
);

export const googleCalendarEvents = pgTable(
  'google_calendar_events',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id').references(
      () => googleCalendarConnections.id,
      { onDelete: 'cascade' },
    ),
    calendarId: uuid('calendar_id')
      .notNull()
      .references(() => googleCalendars.id, { onDelete: 'cascade' }),
    externalId: varchar('external_id', { length: 512 }).notNull(),
    googleCalendarExternalId: varchar('google_calendar_external_id', {
      length: 255,
    }),
    googleEventId: varchar('google_event_id', { length: 512 }),
    recurringEventId: varchar('recurring_event_id', { length: 512 }),
    etag: varchar('etag', { length: 255 }),
    status: varchar('status', { length: 20 }).notNull().default('synced'),
    ownership: varchar('ownership', { length: 24 })
      .notNull()
      .default('google_imported'),
    beeplanEntityType: varchar('beeplan_entity_type', { length: 24 }),
    beeplanEntityId: varchar('beeplan_entity_id', { length: 255 }),
    lastGoogleUpdatedAt: timestamp('last_google_updated_at'),
    title: varchar('title', { length: 500 }).notNull(),
    description: text('description'),
    location: text('location'),
    startAt: timestamp('start_at'),
    endAt: timestamp('end_at'),
    allDay: boolean('all_day').notNull().default(false),
    timezone: varchar('timezone', { length: 100 }),
    payload: jsonb('payload').notNull().default({}),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('uq_google_events_user_external').on(
      table.userId,
      table.externalId,
    ),
    uniqueIndex('uq_google_events_user_entity').on(
      table.userId,
      table.beeplanEntityType,
      table.beeplanEntityId,
    ),
    index('idx_google_events_user_start').on(table.userId, table.startAt),
  ],
);

export const googleCalendarSyncJobs = pgTable(
  'google_calendar_sync_jobs',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => googleCalendarConnections.id, { onDelete: 'cascade' }),
    operation: varchar('operation', { length: 16 }).notNull(),
    entityType: varchar('entity_type', { length: 24 }).notNull(),
    entityId: varchar('entity_id', { length: 255 }).notNull(),
    attemptCount: integer('attempt_count').notNull().default(0),
    nextRetryAt: timestamp('next_retry_at').defaultNow().notNull(),
    lastError: text('last_error'),
    status: varchar('status', { length: 16 }).notNull().default('pending'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('uq_google_sync_jobs_pending_entity').on(
      table.userId,
      table.entityType,
      table.entityId,
      table.operation,
      table.status,
    ),
    index('idx_google_sync_jobs_due').on(table.status, table.nextRetryAt),
  ],
);

// Task Context Assistant. Weather/route evidence remains in the existing
// weather-travel tables; these rows persist user intent and checklist state.
export const taskAssistantPreferences = pgTable('task_assistant_preferences', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  enabled: boolean('enabled').notNull().default(true),
  preparationChecklistsEnabled: boolean('preparation_checklists_enabled')
    .notNull()
    .default(true),
  travelAdviceEnabled: boolean('travel_advice_enabled').notNull().default(true),
  weatherAdviceEnabled: boolean('weather_advice_enabled')
    .notNull()
    .default(true),
  documentAdviceEnabled: boolean('document_advice_enabled')
    .notNull()
    .default(true),
  clothingAdviceEnabled: boolean('clothing_advice_enabled')
    .notNull()
    .default(true),
  umbrellaAdviceEnabled: boolean('umbrella_advice_enabled')
    .notNull()
    .default(true),
  hydrationAdviceEnabled: boolean('hydration_advice_enabled')
    .notNull()
    .default(true),
  proactiveAssistanceEnabled: boolean('proactive_assistance_enabled')
    .notNull()
    .default(true),
  dynamicPreparationEnabled: boolean('dynamic_preparation_enabled')
    .notNull()
    .default(true),
  dynamicPackingEnabled: boolean('dynamic_packing_enabled')
    .notNull()
    .default(true),
  contextTimelineEnabled: boolean('context_timeline_enabled')
    .notNull()
    .default(true),
  contextualNotificationsEnabled: boolean('contextual_notifications_enabled')
    .notNull()
    .default(true),
  electronicsAdviceEnabled: boolean('electronics_advice_enabled')
    .notNull()
    .default(true),
  medicationAdviceEnabled: boolean('medication_advice_enabled')
    .notNull()
    .default(true),
  departureRemindersEnabled: boolean('departure_reminders_enabled')
    .notNull()
    .default(true),
  notificationMode: varchar('notification_mode', { length: 24 })
    .notNull()
    .default('smart'),
  defaultTravelMode: varchar('default_travel_mode', { length: 24 })
    .notNull()
    .default('driving'),
  language: varchar('language', { length: 8 }).notNull().default('en'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const taskAssistantContexts = pgTable(
  'task_assistant_contexts',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    subtaskId: uuid('subtask_id').references(() => subtasks.id, {
      onDelete: 'cascade',
    }),
    primaryContext: varchar('primary_context', { length: 40 }).notNull(),
    secondaryContexts: jsonb('secondary_contexts').notNull().default([]),
    confidence: varchar('confidence', { length: 20 }).notNull(),
    confidenceReason: text('confidence_reason').notNull(),
    assumptions: jsonb('assumptions').notNull().default([]),
    correctedContext: varchar('corrected_context', { length: 40 }),
    scheduleVersion: varchar('schedule_version', { length: 160 }).notNull(),
    generatedAt: timestamp('generated_at').defaultNow().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('uq_task_assistant_context_item').on(
      table.userId,
      table.taskId,
    ),
    index('idx_task_assistant_context_task').on(table.taskId),
  ],
);

export const taskAssistantSuggestions = pgTable(
  'task_assistant_suggestions',
  {
    id: id(),
    contextId: uuid('context_id')
      .notNull()
      .references(() => taskAssistantContexts.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 60 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description').notNull(),
    reason: text('reason').notNull(),
    evidence: jsonb('evidence').notNull().default({}),
    evidenceType: varchar('evidence_type', { length: 40 }).notNull(),
    status: varchar('status', { length: 24 }).notNull().default('pending'),
    fingerprint: varchar('fingerprint', { length: 128 }).notNull(),
    dueAt: timestamp('due_at'),
    notificationAt: timestamp('notification_at'),
    quantity: varchar('quantity', { length: 80 }),
    quantityUnit: varchar('quantity_unit', { length: 40 }),
    userEdited: boolean('user_edited').notNull().default(false),
    category: varchar('category', { length: 40 }),
    priority: varchar('priority', { length: 16 }).notNull().default('medium'),
    suggestedStageId: uuid('suggested_stage_id'),
    notificationEligible: boolean('notification_eligible')
      .notNull()
      .default(false),
    lockedByUser: boolean('locked_by_user').notNull().default(false),
    completedAt: timestamp('completed_at'),
    dismissedAt: timestamp('dismissed_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('uq_task_assistant_suggestion_fingerprint').on(
      table.fingerprint,
    ),
    index('idx_task_assistant_suggestion_context').on(table.contextId),
    index('idx_task_assistant_suggestion_status').on(table.status),
  ],
);

export const taskAssistantEvaluations = pgTable(
  'task_assistant_evaluations',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
    subtaskId: uuid('subtask_id').references(() => subtasks.id, {
      onDelete: 'cascade',
    }),
    contextVersion: varchar('context_version', { length: 160 }).notNull(),
    scheduleVersion: varchar('schedule_version', { length: 160 }).notNull(),
    evidenceVersion: varchar('evidence_version', { length: 160 }).notNull(),
    status: varchar('status', { length: 24 }).notNull().default('current'),
    confidence: varchar('confidence', { length: 20 }).notNull(),
    generatedAt: timestamp('generated_at').notNull().defaultNow(),
    validUntil: timestamp('valid_until').notNull(),
    invalidatedAt: timestamp('invalidated_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('idx_task_assistant_evaluation_task').on(
      table.userId,
      table.taskId,
      table.status,
    ),
  ],
);

export const taskAssistantTimelineStages = pgTable(
  'task_assistant_timeline_stages',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    contextId: uuid('context_id')
      .notNull()
      .references(() => taskAssistantContexts.id, { onDelete: 'cascade' }),
    stageType: varchar('stage_type', { length: 40 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description').notNull(),
    scheduledAt: timestamp('scheduled_at'),
    dueAt: timestamp('due_at'),
    priority: varchar('priority', { length: 16 }).notNull(),
    status: varchar('status', { length: 24 }).notNull().default('pending'),
    fingerprint: varchar('fingerprint', { length: 128 }).notNull(),
    triggerReason: text('trigger_reason').notNull(),
    completedAt: timestamp('completed_at'),
    dismissedAt: timestamp('dismissed_at'),
    invalidatedAt: timestamp('invalidated_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('uq_task_assistant_timeline_fingerprint').on(table.fingerprint),
    index('idx_task_assistant_timeline_context').on(
      table.contextId,
      table.status,
    ),
  ],
);

export const taskAssistantNotifications = pgTable(
  'task_assistant_notifications',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    contextId: uuid('context_id')
      .notNull()
      .references(() => taskAssistantContexts.id, { onDelete: 'cascade' }),
    notificationType: varchar('notification_type', { length: 40 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    body: text('body').notNull(),
    scheduledAt: timestamp('scheduled_at').notNull(),
    priority: varchar('priority', { length: 16 }).notNull(),
    status: varchar('status', { length: 24 }).notNull().default('pending'),
    fingerprint: varchar('fingerprint', { length: 128 }).notNull(),
    deliveredAt: timestamp('delivered_at'),
    retryCount: integer('retry_count').notNull().default(0),
    lastErrorCode: varchar('last_error_code', { length: 80 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('uq_task_assistant_notification_fingerprint').on(
      table.fingerprint,
    ),
    index('idx_task_assistant_notifications_due').on(
      table.status,
      table.scheduledAt,
    ),
  ],
);
