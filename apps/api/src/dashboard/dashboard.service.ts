import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service';
import { reminders, tasks } from '../db/schema';

export type DashboardSummary = {
  todayTasks: number;
  completedTasks: number;
  highPriorityTasks: number;
  reminders: number;
  totalTasks: number;
  overallProgress: number;
};

@Injectable()
export class DashboardService {
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  async getSummary(userId: string): Promise<DashboardSummary> {
    const [userTasks, userReminders] = await Promise.all([
      this.db
        .select({
          status: tasks.status,
          priority: tasks.priority,
          dueDate: tasks.dueDate,
          reminderEnabled: tasks.reminderEnabled,
        })
        .from(tasks)
        .where(eq(tasks.userId, userId)),
      this.db
        .select({ status: reminders.status })
        .from(reminders)
        .where(eq(reminders.userId, userId)),
    ]);

    // Compare in UTC rather than the server process's local time zone. The
    // `due_date` column is a timezone-less `timestamp`, and Postgres/driver
    // round-tripping of JS Date values through it is only consistent in UTC —
    // using local `setHours()` here caused tasks due "yesterday" evening to
    // be miscounted as "today" whenever the local UTC offset was positive.
    const now = new Date();
    const startOfToday = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const startOfTomorrow = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
    );

    const totalTasks = userTasks.length;
    const completedTasks = userTasks.filter(
      (task) => task.status === 'done',
    ).length;
    const highPriorityTasks = userTasks.filter(
      (task) => task.priority === 'high',
    ).length;
    const todayTasks = userTasks.filter(
      (task) =>
        task.dueDate !== null &&
        task.dueDate >= startOfToday &&
        task.dueDate < startOfTomorrow,
    ).length;

    // The `reminders` table has no direct link back to `tasks` (see
    // DatabaseService.ensureRemindersTable, which drops a legacy `task_id`
    // column), but a task can have its own independent reminder toggle
    // (`tasks.reminderEnabled`) — that's the "task reminder" this counts.
    const taskReminders = userTasks.filter(
      (task) => task.reminderEnabled,
    ).length;
    const activeReminders = userReminders.filter(
      (reminder) => reminder.status === 'active',
    ).length;

    const overallProgress =
      totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);

    return {
      todayTasks,
      completedTasks,
      highPriorityTasks,
      reminders: activeReminders + taskReminders,
      totalTasks,
      overallProgress,
    };
  }
}
