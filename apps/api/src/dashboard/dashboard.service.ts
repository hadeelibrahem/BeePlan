import { Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service';
import { reminders, tasks } from '../db/schema';
import { getUtcDayBoundaries } from './dashboard-date.util';

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
    const { startOfToday, startOfTomorrow } = getUtcDayBoundaries();
    const [taskRows, reminderRows] = await Promise.all([
      this.db
        .select({
          total: sql<string>`count(*)`,
          completed: sql<string>`count(*) filter (where ${tasks.status} = 'done')`,
          highPriority: sql<string>`count(*) filter (where ${tasks.priority} = 'high')`,
          today: sql<string>`count(*) filter (where ${tasks.dueDate} >= ${startOfToday} and ${tasks.dueDate} < ${startOfTomorrow})`,
          taskReminders: sql<string>`count(*) filter (where ${tasks.reminderEnabled} = true)`,
        })
        .from(tasks)
        .where(eq(tasks.userId, userId)),
      this.db
        .select({
          active: sql<string>`count(*) filter (where ${reminders.status} = 'active')`,
        })
        .from(reminders)
        .where(eq(reminders.userId, userId)),
    ]);

    // Compare in UTC rather than the server process's local time zone. The
    // `due_date` column is a timezone-less `timestamp`, and Postgres/driver
    // round-tripping of JS Date values through it is only consistent in UTC —
    // using local `setHours()` here caused tasks due "yesterday" evening to
    // be miscounted as "today" whenever the local UTC offset was positive.
    const taskCounts = taskRows[0];
    const totalTasks = Number(taskCounts?.total ?? 0);
    const completedTasks = Number(taskCounts?.completed ?? 0);
    const highPriorityTasks = Number(taskCounts?.highPriority ?? 0);
    const todayTasks = Number(taskCounts?.today ?? 0);

    // Standalone active reminders and task-level reminder toggles are separate
    // concepts, so both contribute to the dashboard reminder count.
    const taskReminders = Number(taskCounts?.taskReminders ?? 0);
    const activeReminders = Number(reminderRows[0]?.active ?? 0);

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
