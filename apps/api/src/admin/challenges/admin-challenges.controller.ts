import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, type AuthenticatedRequest } from '../../auth/jwt-auth.guard';
import { ChallengesService } from '../../challenges/challenges.service';
import { AdminGuard } from '../auth/admin.guard';
import { RequireAdmin } from '../auth/require-admin.decorator';
import { AdminAuditLogService } from '../audit/admin-audit.service';
@Controller('admin/challenges') @UseGuards(JwtAuthGuard, AdminGuard) @RequireAdmin()
export class AdminChallengesController {
  constructor(private readonly challenges: ChallengesService, private readonly audit: AdminAuditLogService) {}
  @Post() async create(@Req() req: AuthenticatedRequest, @Body() body: any) { const row = await this.challenges.create(req.user.id, body); await this.audit.write({ actorUserId: req.user.id, action: 'challenge.created', targetType: 'challenge', targetId: row.id, afterState: { title: row.title, type: row.type, targetValue: row.targetValue, status: row.status } }); return row; }
  @Get() list(@Query() query: any) { return this.challenges.listAdmin(query); }
  @Get(':id/analytics') analytics(@Param('id') id: string) { return this.challenges.analytics(id); }
  @Get(':id') get(@Param('id') id: string) { return this.challenges.detailAdmin(id); }
  @Patch(':id') async update(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: any) { const before = await this.challenges.get(id); const row = await this.challenges.update(req.user.id, id, body); await this.audit.write({ actorUserId: req.user.id, action: 'challenge.updated', targetType: 'challenge', targetId: id, beforeState: { title: before.title, description: before.description }, afterState: { title: row.title, description: row.description } }); return row; }
  @Post(':id/publish') async publish(@Req() req: AuthenticatedRequest, @Param('id') id: string) { const row = await this.challenges.publish(id); await this.audit.write({ actorUserId: req.user.id, action: 'challenge.published', targetType: 'challenge', targetId: id, afterState: { status: row.status, publishedAt: row.publishedAt } }); return row; }
  @Post(':id/cancel') async cancel(@Req() req: AuthenticatedRequest, @Param('id') id: string) { const row = await this.challenges.cancel(id); await this.audit.write({ actorUserId: req.user.id, action: 'challenge.cancelled', targetType: 'challenge', targetId: id, afterState: { status: row.status, cancelledAt: row.cancelledAt } }); return row; }
}
