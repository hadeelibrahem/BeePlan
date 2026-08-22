import { Module } from '@nestjs/common';
import { DatabaseModule } from '../db/database.module';
import { AdminController } from './admin.controller';
import { AdminAuditController } from './audit/admin-audit.controller';
import { AdminAuditLogService } from './audit/admin-audit.service';
import { AdminGuard } from './auth/admin.guard';
import { AdminDashboardController } from './dashboard/admin-dashboard.controller';
import { AdminDashboardService } from './dashboard/admin-dashboard.service';
import { AdminUsersController } from './users/admin-users.controller';
import { AdminUsersService } from './users/admin-users.service';
import { AdminErrorsController } from './errors/admin-errors.controller';
import { AdminErrorsService } from './errors/admin-errors.service';
import { ChallengesModule } from '../challenges/challenges.module';
import { AdminChallengesController } from './challenges/admin-challenges.controller';
import { AdminActionCenterController } from './action-center/admin-action-center.controller';
import { AdminActionCenterService } from './action-center/admin-action-center.service';
import { SuperAdminGuard } from './auth/super-admin.guard';
import { AuthModule } from '../auth/auth.module';
import { AdminManagementController } from './users/admin-management.controller';
import { SystemHealthController } from './system-health/system-health.controller';
import { SystemHealthService } from './system-health/system-health.service';
@Module({
  imports: [DatabaseModule, AuthModule, ChallengesModule],
  controllers: [
    AdminController,
    AdminDashboardController,
    AdminActionCenterController,
    AdminUsersController,
    AdminManagementController,
    AdminAuditController,
    AdminErrorsController,
    AdminChallengesController,
    SystemHealthController,
  ],
  providers: [
    AdminGuard,
    SuperAdminGuard,
    AdminAuditLogService,
    AdminDashboardService,
    AdminActionCenterService,
    AdminUsersService,
    AdminErrorsService,
    SystemHealthService,
  ],
  exports: [AdminGuard, SuperAdminGuard, AdminAuditLogService],
})
export class AdminModule {}
