import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { and, desc, eq, inArray, ne } from 'drizzle-orm';
import { TaskAccessService } from '../collaboration/task-access.service';
import { DatabaseService } from '../db/database.service';
import { aiTaskManagerNotifications, subtaskDependencies, subtasks, taskMembers, tasks } from '../db/schema';
import { NotificationsService } from '../notifications/notifications.service';
import { taskManagerCandidates, type TaskManagerCandidate } from './task-manager.logic';

const OPEN = ['todo', 'in_progress'] as const;

@Injectable()
export class AiTaskManagerService {
  constructor(private readonly databaseService: DatabaseService, private readonly access: TaskAccessService, private readonly notifications: NotificationsService) {}
  private get db() { return this.databaseService.db; }

  @Cron('*/15 * * * *')
  async scheduledEvaluation() {
    const rows = await this.db.select({ id: tasks.id }).from(tasks).where(inArray(tasks.status, [...OPEN])).limit(500);
    for (const row of rows) await this.evaluateTask(row.id).catch(() => undefined);
  }

  async evaluateTask(taskId: string, now = new Date()) {
    const [task] = await this.db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
    if (!task) throw new NotFoundException('Task not found.');
    const subtaskRows = await this.db.select().from(subtasks).where(eq(subtasks.taskId, taskId));
    const dependencyRows = await this.db.select().from(subtaskDependencies).where(inArray(subtaskDependencies.subtaskId, subtaskRows.map((s) => s.id)));
    const statusById = new Map(subtaskRows.map((s) => [s.id, s.status]));
    const candidates = taskManagerCandidates({ task, subtasks: subtaskRows, dependencies: dependencyRows.map((d) => ({ ...d, completed: statusById.get(d.dependsOnSubtaskId) === 'done' })), now });
    const current = await this.db.select({ fingerprint: aiTaskManagerNotifications.fingerprint }).from(aiTaskManagerNotifications).where(eq(aiTaskManagerNotifications.taskId, taskId));
    const activeFingerprints = new Set(candidates.map((c) => c.fingerprint));
    const stale = current.map((r) => r.fingerprint).filter((f) => !activeFingerprints.has(f));
    if (stale.length) await this.db.update(aiTaskManagerNotifications).set({ status: 'expired', updatedAt: now }).where(inArray(aiTaskManagerNotifications.fingerprint, stale));
    for (const candidate of candidates) await this.persistCandidate(taskId, candidate, now);
    return { taskId, evaluatedAt: now.toISOString(), detected: candidates.length };
  }

  private async persistCandidate(taskId: string, candidate: TaskManagerCandidate, now: Date) {
    const [existing] = await this.db.select({ id: aiTaskManagerNotifications.id }).from(aiTaskManagerNotifications).where(eq(aiTaskManagerNotifications.fingerprint, candidate.fingerprint)).limit(1);
    if (existing) return;
    const [row] = await this.db.insert(aiTaskManagerNotifications).values({
      taskId, subtaskId: candidate.subtaskId ?? null, recipientUserId: candidate.recipientUserId,
      notificationType: candidate.type, severity: candidate.severity, title: candidate.title, summary: candidate.summary,
      explanation: candidate.explanation, evidence: candidate.evidence, confidence: candidate.confidence,
      recommendedAction: candidate.action, fingerprint: candidate.fingerprint, expiresAt: candidate.expiresAt ?? null,
    }).returning({ id: aiTaskManagerNotifications.id });
    if (!row) return;
    await this.notifications.create({ userId: candidate.recipientUserId, type: candidate.type as never, title: candidate.title, body: candidate.summary, taskId, priority: candidate.severity === 'critical' ? 'high' : candidate.severity === 'info' ? 'low' : 'normal', data: { source: 'ai_task_manager', aiTaskManagerNotificationId: row.id, entityType: candidate.subtaskId ? 'subtask' : 'task', entityId: candidate.subtaskId ?? taskId, route: candidate.action.route, severity: candidate.severity, explanation: candidate.explanation, evidence: candidate.evidence, confidence: candidate.confidence, recommendedAction: candidate.action } });
  }

  async list(userId: string, status?: string) {
    const rows = await this.db.select().from(aiTaskManagerNotifications).where(and(eq(aiTaskManagerNotifications.recipientUserId, userId), status ? eq(aiTaskManagerNotifications.status, status) : ne(aiTaskManagerNotifications.status, 'expired'))).orderBy(desc(aiTaskManagerNotifications.createdAt)).limit(100);
    return { items: rows.map((row) => ({ ...row, evidence: row.evidence ?? [], recommendedAction: row.recommendedAction ?? {}, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), readAt: row.readAt?.toISOString() ?? null, dismissedAt: row.dismissedAt?.toISOString() ?? null, snoozedUntil: row.snoozedUntil?.toISOString() ?? null, actionedAt: row.actionedAt?.toISOString() ?? null, expiresAt: row.expiresAt?.toISOString() ?? null })) };
  }

  async updateStatus(userId: string, id: string, action: 'read' | 'dismiss' | 'snooze' | 'action') {
    const [row] = await this.db.select().from(aiTaskManagerNotifications).where(and(eq(aiTaskManagerNotifications.id, id), eq(aiTaskManagerNotifications.recipientUserId, userId))).limit(1);
    if (!row) throw new NotFoundException('AI Task Manager notification not found.');
    if (row.status === 'expired') throw new BadRequestException('This notification is no longer relevant.');
    const now = new Date();
    const patch = action === 'read' ? { status: 'read', readAt: now } : action === 'dismiss' ? { status: 'dismissed', dismissedAt: now } : action === 'action' ? { status: 'actioned', actionedAt: now } : { status: 'snoozed', snoozedUntil: new Date(now.getTime() + 24 * 60 * 60_000) };
    await this.db.update(aiTaskManagerNotifications).set({ ...patch, updatedAt: now }).where(eq(aiTaskManagerNotifications.id, id));
    return { success: true, status: patch.status };
  }

  async evaluateForUser(userId: string, taskId: string) { await this.access.require(userId, taskId, 'viewer'); return this.evaluateTask(taskId); }
}
