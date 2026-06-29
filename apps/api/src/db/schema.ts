import {
  boolean,
  date,
  decimal,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
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

export const tasks = pgTable('tasks', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  priority: varchar('priority', { length: 20 }).notNull().default('medium'),
  status: varchar('status', { length: 20 }).notNull().default('todo'),
  dueDate: timestamp('due_date'),
  categoryId: uuid('category_id').references(() => categories.id, {
    onDelete: 'set null',
  }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const subtasks = pgTable('subtasks', {
  id: id(),
  taskId: uuid('task_id')
    .notNull()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  isDone: boolean('is_done').notNull().default(false),
  orderIndex: integer('order_index').notNull().default(0),
});

export const reminders = pgTable('reminders', {
  id: id(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
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
  location: jsonb('location'),
  context: jsonb('context'),
  checklistItems: jsonb('checklist_items'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

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

export const notifications = pgTable('notifications', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  reminderId: uuid('reminder_id').references(() => reminders.id, {
    onDelete: 'set null',
  }),
  title: varchar('title', { length: 255 }).notNull(),
  body: text('body').notNull(),
  notificationType: varchar('notification_type', { length: 50 }).notNull(),
  isRead: boolean('is_read').notNull().default(false),
  sentAt: timestamp('sent_at').defaultNow().notNull(),
});

export const deviceTokens = pgTable('device_tokens', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull(),
  platform: varchar('platform', { length: 20 }).notNull(),
  createdAt: createdAt(),
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
