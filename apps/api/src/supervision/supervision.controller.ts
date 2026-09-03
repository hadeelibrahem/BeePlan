import { Body, Controller, Delete, Get, Logger, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common'
import { JwtAuthGuard, type AuthenticatedRequest } from '../auth/jwt-auth.guard'
import { SupervisionService } from './supervision.service'
import { SupervisionProgressProjectionService } from './supervision-progress-projection.service'
import { AppGuardService } from './app-guard.service'

@UseGuards(JwtAuthGuard)
@Controller('supervision')
export class SupervisionController {
  private readonly logger = new Logger(SupervisionController.name)
  constructor(private readonly service: SupervisionService, private readonly progress: SupervisionProgressProjectionService, private readonly appGuard: AppGuardService) {}
  @Get('app-guard') appGuardSettings(@Req() req: AuthenticatedRequest) { return this.appGuard.settings(req.user.id) }
  @Put('app-guard') updateAppGuard(@Req() req: AuthenticatedRequest, @Body() body: Record<string, unknown>) { return this.appGuard.updateSettings(req.user.id, body) }
  @Put('app-guard/apps') replaceAppGuardApps(@Req() req: AuthenticatedRequest, @Body() body: Record<string, unknown>) { return this.appGuard.replaceApps(req.user.id, body) }
  @Get('app-guard/restrictions') appGuardRestrictions(@Req() req: AuthenticatedRequest) { return this.appGuard.restrictions(req.user.id) }
  @Post('app-guard/access-requests') appGuardAccessRequest(@Req() req: AuthenticatedRequest, @Body() body: Record<string, unknown>) { return this.appGuard.requestAccess(req.user.id, body) }
  @Get('app-guard/decisions') appGuardDecisions(@Req() req: AuthenticatedRequest) { return this.appGuard.decisions(req.user.id) }
  @Get('people') people(@Req() req: AuthenticatedRequest, @Query('q') q = '') { return this.service.people(req.user.id, q) }
  @Post('requests') request(@Req() req: AuthenticatedRequest, @Body() body: Record<string, unknown>) { return this.service.request(req.user.id, body) }
  @Get('requests') requests(@Req() req: AuthenticatedRequest) { return this.service.requests(req.user.id) }
  @Post('requests/:id/accept') accept(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) { return this.service.respond(req.user.id, id, true) }
  @Post('requests/:id/reject') reject(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) { return this.service.respond(req.user.id, id, false) }
  @Get('relationships') async relationships(@Req() req: AuthenticatedRequest) { if (process.env.NODE_ENV !== 'production') this.logger.debug('[Supervision] relationships request authenticated'); try { const rows = await this.service.relationships(req.user.id); if (process.env.NODE_ENV !== 'production') this.logger.debug(`[Supervision] relationships response count=${rows.length}`); return rows } catch (error) { if (process.env.NODE_ENV !== 'production') this.logger.error(`[Supervision] relationships query failed category=${error instanceof Error ? error.name : 'unknown'}`); throw error } }
  @Delete('relationships/:id') revoke(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) { return this.service.revoke(req.user.id, id) }
  @Patch('relationships/:id/permissions') updatePermissions(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: Record<string, unknown>) { return this.service.updatePermissions(req.user.id, id, body) }
  @Get('relationships/:id/rules') rules(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) { return this.service.rules(req.user.id, id) }
  @Post('relationships/:id/rules') createRule(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: Record<string, unknown>) { return this.service.createRule(req.user.id, id, body) }
  @Patch('rules/:id') updateRule(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: Record<string, unknown>) { return this.service.updateRule(req.user.id, id, body) }
  @Post('rules/:id/:action') action(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Param('action') action: string) { return this.service.action(req.user.id, id, action) }
  @Get('audit') audit(@Req() req: AuthenticatedRequest, @Query('relationshipId', ParseUUIDPipe) relationshipId: string) { return this.service.audit(req.user.id, relationshipId) }
  @Get('reports') report(@Req() req: AuthenticatedRequest, @Query('relationshipId', ParseUUIDPipe) relationshipId: string) { return this.service.report(req.user.id, relationshipId) }
  @Get('devices') devices(@Req() req: AuthenticatedRequest) { return this.service.devices(req.user.id) }
  @Post('devices/register') registerDevice(@Req() req: AuthenticatedRequest, @Body() body: Record<string, unknown>) { return this.service.registerDevice(req.user.id, body) }
  @Patch('devices/:id/capability') updateDevice(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: Record<string, unknown>) { return this.service.updateDevice(req.user.id, id, body) }
  @Get('devices/:id/managed-apps') managedApps(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) { return this.service.managedApps(req.user.id, id) }
  @Put('devices/:id/managed-apps') configureManagedApps(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: Record<string, unknown>) { return this.service.configureManagedApps(req.user.id, id, body) }
  @Get('relationships/:id/approved-apps') approvedApps(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) { return this.service.approvedApps(req.user.id, id) }
  @Get('relationships/:id/managed-apps') managedAppsForGuardian(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) { return this.service.approvedApps(req.user.id, id) }
  @Get('device-restrictions') deviceRestrictions(@Req() req: AuthenticatedRequest) { return this.service.deviceRestrictions(req.user.id) }
  @Post('access-requests') accessRequest(@Req() req: AuthenticatedRequest, @Body() body: Record<string, unknown>) { return this.service.requestTemporaryAccess(req.user.id, body) }
  @Get('access-requests') accessRequests(@Req() req: AuthenticatedRequest, @Query('relationshipId') relationshipId?: string) { return this.service.accessRequests(req.user.id, relationshipId) }
  @Post('access-requests/:id/approve') approveAccess(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) { return this.service.supervisorDecision(req.user.id, id, true) }
  @Post('access-requests/:id/deny') denyAccess(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) { return this.service.supervisorDecision(req.user.id, id, false) }
  @Post('restrictions/reconcile') reconcileRestrictions() { return this.service.reconcileRestrictions() }
  @Get('relationships/:id/tasks') guardianTasks(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Query('filter') filter?: string) { return this.progress.tasks(req.user.id, id, filter) }
  @Get('relationships/:id/progress') guardianProgress(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) { return this.progress.progress(req.user.id, id) }
  @Get('relationships/:id/focus-summary') focusSummary(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) { return this.progress.focusSummary(req.user.id, id) }
  @Get('relationships/:id/achievements') achievements(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) { return this.progress.achievementSummary(req.user.id, id) }
  @Get('relationships/:id/weekly-summary') weekly(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) { return this.progress.weeklySummary(req.user.id, id) }
}
