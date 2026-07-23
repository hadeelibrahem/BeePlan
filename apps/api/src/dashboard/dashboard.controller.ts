import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DashboardService } from './dashboard.service';

@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  getSummary(@Req() request: AuthenticatedRequest) {
    return this.dashboardService.getSummary(request.user.id);
  }

  @Get('today')
  getToday(@Req() request: AuthenticatedRequest) {
    return this.dashboardService.getToday(request.user.id);
  }
}
