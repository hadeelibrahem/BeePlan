import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, ilike, or, sql } from 'drizzle-orm';
import { DatabaseService } from '../../db/database.service';
import { AuthService } from '../../auth/auth.service';
import { users } from '../../db/schema';
import { AdminAuditLogService } from '../audit/admin-audit.service';
import { accountStatusUpdate } from './account-status';

const publicUser = (user: typeof users.$inferSelect) => ({
  id: user.id,
  fullName: user.fullName,
  username: user.username,
  email: user.email,
  role:
    user.role === 'super_admin'
      ? 'super_admin'
      : user.role === 'admin'
        ? 'admin'
        : 'user',
  accountStatus: user.accountStatus === 'suspended' ? 'suspended' : 'active',
  createdAt: user.createdAt.toISOString(),
});
@Injectable()
export class AdminUsersService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AdminAuditLogService,
    private readonly auth: AuthService,
  ) {}
  async list(input: {
    search?: string;
    role?: string;
    accountStatus?: string;
    page: number;
    limit: number;
  }) {
    const clauses = [];
    if (input.search?.trim()) {
      const q = `%${input.search.trim()}%`;
      clauses.push(
        or(
          ilike(users.fullName, q),
          ilike(users.username, q),
          ilike(users.email, q),
        ),
      );
    }
    if (input.role === 'admin') {
      clauses.push(or(eq(users.role, 'admin'), eq(users.role, 'super_admin')));
    } else if (input.role) {
      clauses.push(eq(users.role, input.role));
    }
    if (input.accountStatus)
      clauses.push(eq(users.accountStatus, input.accountStatus));
    const where = clauses.length ? and(...clauses) : undefined;
    const [{ total }] = await this.database.db
      .select({ total: sql<number>`count(*)` })
      .from(users)
      .where(where);
    const rows = await this.database.db
      .select()
      .from(users)
      .where(where)
      .orderBy(asc(users.createdAt))
      .limit(input.limit)
      .offset((input.page - 1) * input.limit);
    return {
      items: rows.map(publicUser),
      page: input.page,
      limit: input.limit,
      total: Number(total),
    };
  }
  async updateStatus(
    actorId: string,
    targetId: string,
    status: 'active' | 'suspended',
    reason?: string,
  ) {
    if (actorId === targetId && status === 'suspended')
      throw new ConflictException('CANNOT_SUSPEND_SELF');
    return this.database.db.transaction(async (tx) => {
      const [target] = await tx
        .select()
        .from(users)
        .where(eq(users.id, targetId))
        .limit(1);
      if (!target) throw new NotFoundException('User not found.');
      const [actor] = await tx
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, actorId))
        .limit(1);
      if (
        ['admin', 'super_admin'].includes(target.role) &&
        actor?.role !== 'super_admin'
      )
        throw new ConflictException('SUPER_ADMIN_REQUIRED');
      const next = accountStatusUpdate(target, status, reason);
      const [updated] = await tx
        .update(users)
        .set(next)
        .where(eq(users.id, targetId))
        .returning();
      await this.audit.write(
        {
          actorUserId: actorId,
          action: status === 'suspended' ? 'user.suspended' : 'user.restored',
          targetType: 'user',
          targetId,
          beforeState: statusState(target),
          afterState: statusState(updated),
          metadata:
            status === 'suspended' && reason ? { reason: reason.trim() } : null,
        },
        tx as unknown as typeof this.database.db,
      );
      return publicUser(updated);
    });
  }
  async updateRole(actorId: string, targetId: string, role: 'user' | 'admin') {
    throw new ConflictException('ROLE_CHANGES_DISABLED');
  }
  async createAdmin(actorId: string, payload: unknown) {
    const created = await this.auth.register(payload);
    const [updated] = await this.database.db
      .update(users)
      .set({ role: 'admin', tokenVersion: 1, updatedAt: new Date() })
      .where(eq(users.id, created.user.id))
      .returning();
    if (!updated) throw new NotFoundException('Created account not found.');
    await this.audit.write({
      actorUserId: actorId,
      action: 'admin.created',
      targetType: 'user',
      targetId: updated.id,
      afterState: {
        role: 'admin',
        email: updated.email,
        fullName: updated.fullName,
      },
    });
    return publicUser(updated);
  }
  async promoteUser(actorId: string, targetId: string) {
    return this.database.db.transaction(async (tx) => {
      const [target] = await tx
        .select()
        .from(users)
        .where(eq(users.id, targetId))
        .limit(1);
      if (!target) throw new NotFoundException('User not found.');
      if (target.role !== 'user') {
        throw new ConflictException(
          target.role === 'super_admin'
            ? 'USER_ALREADY_SUPER_ADMIN'
            : 'USER_ALREADY_ADMIN',
        );
      }
      if (target.accountStatus === 'suspended') {
        throw new ConflictException('SUSPENDED_USER_CANNOT_BE_PROMOTED');
      }
      const [updated] = await tx
        .update(users)
        .set({
          role: 'admin',
          tokenVersion: target.tokenVersion + 1,
          updatedAt: new Date(),
        })
        .where(eq(users.id, targetId))
        .returning();
      if (!updated) throw new NotFoundException('User not found.');
      await this.audit.write(
        {
          actorUserId: actorId,
          action: 'admin.user_promoted',
          targetType: 'user',
          targetId: updated.id,
          beforeState: { role: 'user' },
          afterState: { role: 'admin' },
        },
        tx as unknown as typeof this.database.db,
      );
      return publicUser(updated);
    });
  }
  /* Retained for compatibility with existing callers; role transitions are intentionally unavailable. */
  private async legacyUpdateRole(
    actorId: string,
    targetId: string,
    role: 'user' | 'admin',
  ) {
    return this.database.db.transaction(async (tx) => {
      const [target] = await tx
        .select()
        .from(users)
        .where(eq(users.id, targetId))
        .limit(1);
      if (!target) throw new NotFoundException('User not found.');
      if (target.role === 'admin' && role === 'user') {
        const [{ count }] = await tx
          .select({ count: sql<number>`count(*)` })
          .from(users)
          .where(eq(users.role, 'admin'));
        if (Number(count) <= 1) throw new ConflictException('LAST_ADMIN');
        if (actorId === targetId)
          throw new ConflictException('CANNOT_DEMOTE_SELF');
      }
      if (target.role === role) return publicUser(target);
      const [updated] = await tx
        .update(users)
        .set({
          role,
          tokenVersion: target.tokenVersion + 1,
          updatedAt: new Date(),
        })
        .where(eq(users.id, targetId))
        .returning();
      await this.audit.write(
        {
          actorUserId: actorId,
          action: 'user.role_changed',
          targetType: 'user',
          targetId,
          beforeState: { role: target.role },
          afterState: { role: updated.role },
        },
        tx as unknown as typeof this.database.db,
      );
      return publicUser(updated);
    });
  }
}
function statusState(user: typeof users.$inferSelect) {
  return {
    accountStatus: user.accountStatus,
    suspendedAt: user.suspendedAt?.toISOString() ?? null,
    suspensionReason: user.suspensionReason ?? null,
  };
}
