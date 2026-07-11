import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../db/database.service';
import { taskActivities } from '../db/schema';

/**
 * Thin writer for the shared task activity timeline. Collaboration services log
 * through here so member/comment/attachment events land in the same
 * `task_activities` feed that TasksService already reads for `GET /tasks/:id`
 * and `GET /tasks/:id/activity`.
 */
@Injectable()
export class TaskActivityService {
  constructor(private readonly databaseService: DatabaseService) {}

  async log(
    userId: string,
    taskId: string,
    action: string,
    description: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.databaseService.db.insert(taskActivities).values({
      userId,
      taskId,
      action,
      description,
      metadata: metadata ?? null,
    });
  }
}
