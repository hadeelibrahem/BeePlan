import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { AuthenticatedRequest } from '../../auth/jwt-auth.guard';
import { DatabaseService } from '../../db/database.service';
import { users } from '../../db/schema';

/** API-side authorization; the web route gate is only a UX convenience. */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly database: DatabaseService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user?.id)
      throw new ForbiddenException('Admin access is required.');
    const user = await this.database.db.query.users.findFirst({
      columns: { role: true, accountStatus: true },
      where: eq(users.id, request.user.id),
    });
    if (!user || user.accountStatus !== 'active' || !['admin', 'super_admin'].includes(user.role)) {
      throw new ForbiddenException('Admin access is required.');
    }
    return true;
  }
}
