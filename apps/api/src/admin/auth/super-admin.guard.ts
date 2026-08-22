import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { AuthenticatedRequest } from '../../auth/jwt-auth.guard';
import { DatabaseService } from '../../db/database.service';
import { users } from '../../db/schema';

@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(private readonly database: DatabaseService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user?.id) throw new ForbiddenException('Super Admin access is required.');
    const user = await this.database.db.query.users.findFirst({ columns: { role: true, accountStatus: true }, where: eq(users.id, request.user.id) });
    if (!user || user.accountStatus !== 'active' || user.role !== 'super_admin') throw new ForbiddenException('Super Admin access is required.');
    return true;
  }
}
