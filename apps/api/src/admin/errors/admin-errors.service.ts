import { Injectable, NotFoundException } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { and, desc, eq, ilike, inArray, sql } from 'drizzle-orm';
import { DatabaseService } from '../../db/database.service';
import {
  errorGroupUsers,
  errorGroups,
  errorOccurrences,
  users,
} from '../../db/schema';
import { AdminAuditLogService } from '../audit/admin-audit.service';

const countUsers = (groupId: typeof errorGroups.id) =>
  sql<number>`(select count(*) from ${errorGroupUsers} where ${errorGroupUsers.errorGroupId} = ${groupId})`;
const serialize = (
  group: typeof errorGroups.$inferSelect,
  affectedUsers: number,
) => ({
  ...group,
  occurrenceCount: Number(group.occurrenceCount),
  affectedUsers,
  firstSeenAt: group.firstSeenAt.toISOString(),
  lastSeenAt: group.lastSeenAt.toISOString(),
  createdAt: group.createdAt.toISOString(),
  updatedAt: group.updatedAt.toISOString(),
});
@Injectable()
export class AdminErrorsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AdminAuditLogService,
  ) {}
  async list(input: {
    search?: string;
    status?: string;
    severity?: string;
    service?: string;
    route?: string;
    page: number;
    limit: number;
    sort?: string;
  }) {
    const clauses = [];
    if (input.search?.trim()) {
      const q = `%${input.search.trim()}%`;
      clauses.push(
        sql`(${errorGroups.title} ilike ${q} or ${errorGroups.normalizedMessage} ilike ${q})`,
      );
    }
    if (input.status) clauses.push(eq(errorGroups.status, input.status));
    if (input.severity) clauses.push(eq(errorGroups.severity, input.severity));
    if (input.service) clauses.push(eq(errorGroups.service, input.service));
    if (input.route) clauses.push(ilike(errorGroups.route, `%${input.route}%`));
    const where = clauses.length ? and(...clauses) : undefined;
    const affectedUsers = countUsers(errorGroups.id);
    const order =
      input.sort === 'occurrenceCount'
        ? desc(errorGroups.occurrenceCount)
        : input.sort === 'affectedUsers'
          ? desc(affectedUsers)
          : input.sort === 'firstSeen'
            ? desc(errorGroups.firstSeenAt)
            : desc(errorGroups.lastSeenAt);
    const [{ total }] = await this.database.db
      .select({ total: sql<number>`count(*)` })
      .from(errorGroups)
      .where(where);
    const rows = await this.database.db
      .select({ group: errorGroups, affectedUsers })
      .from(errorGroups)
      .where(where)
      .orderBy(order)
      .limit(input.limit)
      .offset((input.page - 1) * input.limit);
    return {
      items: rows.map(({ group, affectedUsers: count }) =>
        serialize(group, Number(count)),
      ),
      page: input.page,
      limit: input.limit,
      total: Number(total),
    };
  }
  async detail(id: string) {
    const rows = await this.database.db
      .select({ group: errorGroups, affectedUsers: countUsers(errorGroups.id) })
      .from(errorGroups)
      .where(eq(errorGroups.id, id))
      .limit(1);
    if (!rows[0]) throw new NotFoundException('Error group not found.');
    const [occurrences, affectedUserRows] = await Promise.all([
      this.database.db
        .select()
        .from(errorOccurrences)
        .where(eq(errorOccurrences.errorGroupId, id))
        .orderBy(desc(errorOccurrences.occurredAt))
        .limit(25),
      this.database.db
        .select({
          id: users.id,
          displayName: users.fullName,
          email: users.email,
          lastSeenAt: errorGroupUsers.lastSeenAt,
          occurrenceCount: errorGroupUsers.occurrenceCount,
        })
        .from(errorGroupUsers)
        .innerJoin(users, eq(errorGroupUsers.userId, users.id))
        .where(eq(errorGroupUsers.errorGroupId, id))
        .orderBy(desc(errorGroupUsers.lastSeenAt))
        .limit(10),
    ]);
    return {
      ...serialize(rows[0].group, Number(rows[0].affectedUsers)),
      recurringAfterResolution:
        rows[0].group.status === 'resolved' &&
        rows[0].group.lastSeenAt > rows[0].group.updatedAt,
      occurrences: occurrences.map((row) => ({
        ...row,
        occurredAt: row.occurredAt.toISOString(),
      })),
      affectedUserReferences: affectedUserRows.map((row) => ({
        ...row,
        occurrenceCount: Number(row.occurrenceCount),
        lastSeenAt: row.lastSeenAt.toISOString(),
      })),
    };
  }
  async changeStatus(
    actorId: string,
    id: string,
    status: 'new' | 'investigating' | 'resolved' | 'ignored',
  ) {
    return this.change(actorId, id, 'status', status);
  }
  async changeSeverity(
    actorId: string,
    id: string,
    severity: 'critical' | 'high' | 'medium' | 'low',
  ) {
    return this.change(actorId, id, 'severity', severity);
  }
  private async change(
    actorId: string,
    id: string,
    field: 'status' | 'severity',
    value: string,
  ) {
    return this.database.db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(errorGroups)
        .where(eq(errorGroups.id, id))
        .limit(1);
      if (!before) throw new NotFoundException('Error group not found.');
      const [after] = await tx
        .update(errorGroups)
        .set({ [field]: value, updatedAt: new Date() })
        .where(eq(errorGroups.id, id))
        .returning();
      await this.audit.write(
        {
          actorUserId: actorId,
          action: `error.${field}_changed`,
          targetType: 'error_group',
          targetId: id,
          beforeState: { [field]: before[field] },
          afterState: { [field]: after[field] },
        },
        tx as unknown as typeof this.database.db,
      );
      return serialize(after, 0);
    });
  }
  async metrics() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [result] = await this.database.db
      .select({
        newErrors: sql<number>`count(*) filter (where ${errorGroups.status} = 'new')`,
        criticalHigh: sql<number>`count(*) filter (where ${errorGroups.severity} in ('critical', 'high') and ${errorGroups.status} not in ('resolved', 'ignored'))`,
        occurrences24h: sql<number>`(select count(*) from ${errorOccurrences} where ${errorOccurrences.occurredAt} >= ${since})`,
        affectedUsers24h: sql<number>`(select count(distinct ${errorOccurrences.userId}) from ${errorOccurrences} where ${errorOccurrences.occurredAt} >= ${since} and ${errorOccurrences.userId} is not null)`,
      })
      .from(errorGroups);
    return Object.fromEntries(
      Object.entries(result).map(([key, value]) => [key, Number(value)]),
    );
  }
}
