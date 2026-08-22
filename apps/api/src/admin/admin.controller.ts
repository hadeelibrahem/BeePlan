import { Controller, Get, InternalServerErrorException, NotFoundException, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, type AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { AdminGuard } from './auth/admin.guard';
import { RequireAdmin } from './auth/require-admin.decorator';
import { DatabaseService } from '../db/database.service';
import { eq } from 'drizzle-orm';
import { users } from '../db/schema';
@Controller('admin') @UseGuards(JwtAuthGuard, AdminGuard) @RequireAdmin()
export class AdminController { constructor(private readonly database: DatabaseService) {} @Get('me') async me(@Req() req: AuthenticatedRequest) { const user = await this.database.db.query.users.findFirst({ columns: { id: true, fullName: true, username: true, email: true, role: true, accountStatus: true, createdAt: true }, where: eq(users.id, req.user.id) }); return user; }
  /** Development/test-only smoke test for the real global observability path. */
  @Post('dev/test-error') testObservabilityError() {
    if (process.env.NODE_ENV === 'production') throw new NotFoundException();
    throw new InternalServerErrorException('BeePlan observability test error');
  }
}
