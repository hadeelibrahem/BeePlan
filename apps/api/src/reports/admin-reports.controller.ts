import { BadRequestException, Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { JwtAuthGuard, type AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../admin/auth/admin.guard';
import { RequireAdmin } from '../admin/auth/require-admin.decorator';
import { ReportsService } from './reports.service';

class QueryDto { @IsOptional() @IsIn(['pending', 'under_review', 'action_taken', 'dismissed']) status?: string; @IsOptional() @IsIn(['harassment', 'spam', 'inappropriate_content', 'impersonation', 'abuse', 'other']) category?: string; @Type(() => Number) @IsInt() @Min(1) page = 1; @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25; }
class StatusDto { @IsIn(['under_review', 'dismissed']) status!: 'under_review' | 'dismissed'; }
class ModerationDto { @IsIn(['warning', 'suspend', 'restore']) action!: 'warning' | 'suspend' | 'restore'; }

@Controller('admin/reports')
@UseGuards(JwtAuthGuard, AdminGuard)
@RequireAdmin()
export class AdminReportsController {
  constructor(private readonly reports: ReportsService) {}
  @Get() list(@Query() query: QueryDto) { return this.reports.list(query); }
  @Get(':id') detail(@Param('id') id: string) { return this.reports.detail(id); }
  @Patch(':id/status') status(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: StatusDto) { return this.reports.status(req.user.id, id, body.status); }
  @Patch(':id/moderate') moderate(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: ModerationDto & { reason?: string }) { if (!body.reason || body.reason.trim().length < 3 || body.reason.length > 1000) throw new BadRequestException('A moderation reason is required.'); return this.reports.moderate(req.user.id, id, body.action, body.reason.trim()); }
}
