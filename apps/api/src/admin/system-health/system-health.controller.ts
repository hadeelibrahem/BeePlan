import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { RequireAdmin } from '../auth/require-admin.decorator';
import { SystemHealthService } from './system-health.service';

@Controller('admin/system-health')
@UseGuards(JwtAuthGuard, AdminGuard)
@RequireAdmin()
export class SystemHealthController {
  constructor(private readonly health: SystemHealthService) {}
  @Get() get() {
    return this.health.getHealth();
  }
}
