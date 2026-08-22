import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { RequireAdmin } from '../auth/require-admin.decorator';
import { AdminDashboardService } from './admin-dashboard.service';
@Controller('admin/dashboard')
@UseGuards(JwtAuthGuard, AdminGuard)
@RequireAdmin()
export class AdminDashboardController {
  constructor(private readonly dashboard: AdminDashboardService) {}
  @Get() get() {
    return this.dashboard.summary();
  }
}
