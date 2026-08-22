import { Injectable } from '@nestjs/common';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { DatabaseService } from '../../db/database.service';
import { adminAuditLogs, users } from '../../db/schema';

type AuditInput = {
  actorUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
};

const forbidden = /password|hash|token|secret|authorization|cookie|oauth|push/i;
function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !forbidden.test(key))
      .map(([key, item]) => [key, sanitize(item)]));
  }
  return typeof value === 'string' ? value.slice(0, 500) : value;
}

@Injectable()
export class AdminAuditLogService {
  constructor(private readonly database: DatabaseService) {}

  async write(input: AuditInput, db = this.database.db) {
    await db.insert(adminAuditLogs).values({
      ...input,
      beforeState: sanitize(input.beforeState) as Record<string, unknown> | null,
      afterState: sanitize(input.afterState) as Record<string, unknown> | null,
      metadata: sanitize(input.metadata) as Record<string, unknown> | null,
    });
  }

  async list(input: { page: number; limit: number; action?: string; actor?: string; targetType?: string; from?: Date; to?: Date }) {
    const clauses = [];
    if (input.action) clauses.push(eq(adminAuditLogs.action, input.action));
    if (input.actor) clauses.push(eq(adminAuditLogs.actorUserId, input.actor));
    if (input.targetType) clauses.push(eq(adminAuditLogs.targetType, input.targetType));
    if (input.from) clauses.push(gte(adminAuditLogs.createdAt, input.from));
    if (input.to) clauses.push(lte(adminAuditLogs.createdAt, input.to));
    const where = clauses.length ? and(...clauses) : undefined;
    const [{ total }] = await this.database.db.select({ total: sql<number>`count(*)` }).from(adminAuditLogs).where(where);
    const rows = await this.database.db.select({ id: adminAuditLogs.id, action: adminAuditLogs.action, targetType: adminAuditLogs.targetType, targetId: adminAuditLogs.targetId, beforeState: adminAuditLogs.beforeState, afterState: adminAuditLogs.afterState, metadata: adminAuditLogs.metadata, createdAt: adminAuditLogs.createdAt, actor: { id: users.id, fullName: users.fullName, email: users.email } }).from(adminAuditLogs).innerJoin(users, eq(adminAuditLogs.actorUserId, users.id)).where(where).orderBy(desc(adminAuditLogs.createdAt)).limit(input.limit).offset((input.page - 1) * input.limit);
    return { items: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })), page: input.page, limit: input.limit, total: Number(total) };
  }
}
