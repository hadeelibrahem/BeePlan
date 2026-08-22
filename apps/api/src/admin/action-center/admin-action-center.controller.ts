import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { RequireAdmin } from '../auth/require-admin.decorator';
import { AdminActionCenterService } from './admin-action-center.service';

@Controller('admin/action-center')
@UseGuards(JwtAuthGuard, AdminGuard)
@RequireAdmin()
export class AdminActionCenterController {
  constructor(private readonly actionCenter: AdminActionCenterService) {}

  @Get()
  get() {
    return this.actionCenter.list();
  }
}
