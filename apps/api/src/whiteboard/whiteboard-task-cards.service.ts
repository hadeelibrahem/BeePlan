import { Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service';
import { subtasks, tasks } from '../db/schema';
import { WhiteboardAccessService } from './whiteboard-access.service';

export type WhiteboardTaskCard = {
  taskId: string;
  title: string;
  priority: string;
  status: string;
  dueDate: string | null;
  progress: { completed: number; total: number; percentage: number };
};

@Injectable()
export class WhiteboardTaskCardsService {
  constructor(private readonly database: DatabaseService, private readonly access: WhiteboardAccessService) {}

  async get(userId: string, boardId: string, taskId: string): Promise<WhiteboardTaskCard> {
    const membership = await this.access.require(userId, boardId, 'view');
    const store = this.getStore(membership.board.snapshot);
    const referenced = Object.values(store).some((record) => {
      if (!record || typeof record !== 'object') return false;
      const value = record as { type?: unknown; typeName?: unknown; props?: { taskId?: unknown } };
      return (value.type === 'beeplan-task' || (value.typeName === 'shape' && value.type === 'beeplan-task')) && value.props?.taskId === taskId;
    });
    if (!referenced) throw new NotFoundException('Task card not found.');

    const [task] = await this.database.db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
    if (!task) throw new NotFoundException('Task card not found.');
    const rows = await this.database.db.select({ isDone: subtasks.isDone, status: subtasks.status }).from(subtasks).where(eq(subtasks.taskId, taskId));
    const completed = rows.filter((row) => row.isDone || row.status === 'done').length;
    const total = rows.length;
    return { taskId: task.id, title: task.title, priority: task.priority, status: task.status, dueDate: task.dueDate?.toISOString() ?? null, progress: { completed, total, percentage: total ? Math.round((completed / total) * 100) : 0 } };
  }

  private getStore(snapshot: unknown): Record<string, unknown> {
    if (!snapshot || typeof snapshot !== 'object') return {};
    const value = snapshot as { document?: { store?: unknown }; store?: unknown };
    const store = value.document?.store ?? value.store;
    return store && typeof store === 'object' ? store as Record<string, unknown> : {};
  }
}
