import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service';
import { taskMembers, tasks } from '../db/schema';

export const TASK_ROLES = ['owner', 'editor', 'viewer'] as const;
export type TaskRole = (typeof TASK_ROLES)[number];

type TaskRow = typeof tasks.$inferSelect;

// Numeric ordering so "at least editor" style checks are a simple comparison.
const ROLE_RANK: Record<TaskRole, number> = { viewer: 1, editor: 2, owner: 3 };

export type TaskAccess = {
  task: TaskRow;
  role: TaskRole;
  // True when the task has at least one accepted collaborator (or a pending
  // invite) — i.e. it is a shared task, not a purely personal one.
  isShared: boolean;
};

/**
 * The one place that answers "may this user do X to this task?". Ownership is
 * always `tasks.userId` (kept authoritative across transfers), and accepted
 * `task_members` rows grant editor/viewer access. Every task endpoint — old
 * and new — funnels its authorization through here so permissions can never be
 * bypassed from the client.
 */
@Injectable()
export class TaskAccessService {
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  /** Resolve a user's effective role, or null if they have no access at all. */
  async getRole(userId: string, taskId: string): Promise<TaskRole | null> {
    const access = await this.tryGetAccess(userId, taskId);
    return access?.role ?? null;
  }

  /** Full access context, or null when the task is missing / not accessible. */
  async tryGetAccess(
    userId: string,
    taskId: string,
  ): Promise<TaskAccess | null> {
    const [task] = await this.db
      .select()
      .from(tasks)
      .where(eq(tasks.id, taskId));
    if (!task) return null;

    const members = await this.db
      .select()
      .from(taskMembers)
      .where(eq(taskMembers.taskId, taskId));

    const isShared = members.length > 0;

    if (task.userId === userId) {
      return { task, role: 'owner', isShared };
    }

    const membership = members.find(
      (member) => member.userId === userId && member.status === 'accepted',
    );
    if (!membership) return null;

    const role = TASK_ROLES.includes(membership.role as TaskRole)
      ? (membership.role as TaskRole)
      : 'viewer';
    return { task, role, isShared };
  }

  /**
   * Require at least `minRole`. A user with no access at all gets a 404 (so we
   * never leak the existence of tasks they can't see); a user who can view but
   * lacks the needed level gets a 403.
   */
  async require(
    userId: string,
    taskId: string,
    minRole: TaskRole = 'viewer',
  ): Promise<TaskAccess> {
    const access = await this.tryGetAccess(userId, taskId);
    if (!access) {
      throw new NotFoundException('Task not found.');
    }
    if (ROLE_RANK[access.role] < ROLE_RANK[minRole]) {
      throw new ForbiddenException(
        minRole === 'owner'
          ? 'Only the task owner can perform this action.'
          : 'You do not have permission to edit this task.',
      );
    }
    return access;
  }

  /** Owner id + every accepted member id — the audience for fan-out. */
  async getRecipientIds(taskId: string): Promise<string[]> {
    const [task] = await this.db
      .select({ userId: tasks.userId })
      .from(tasks)
      .where(eq(tasks.id, taskId));
    if (!task) return [];

    const members = await this.db
      .select({ userId: taskMembers.userId })
      .from(taskMembers)
      .where(
        and(
          eq(taskMembers.taskId, taskId),
          eq(taskMembers.status, 'accepted'),
        ),
      );

    return [...new Set([task.userId, ...members.map((member) => member.userId)])];
  }

  /** taskIds (from the given set) on which the user is an accepted member. */
  async filterAccessibleTaskIds(
    userId: string,
    taskIds: string[],
  ): Promise<Set<string>> {
    if (!taskIds.length) return new Set();
    const rows = await this.db
      .select({ taskId: taskMembers.taskId })
      .from(taskMembers)
      .where(
        and(
          eq(taskMembers.userId, userId),
          eq(taskMembers.status, 'accepted'),
          inArray(taskMembers.taskId, taskIds),
        ),
      );
    return new Set(rows.map((row) => row.taskId));
  }
}
