import { Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { AiTaskManagerService } from './task-manager.service';

@UseGuards(JwtAuthGuard)
@Controller('ai-task-manager')
export class AiTaskManagerController {
  constructor(private readonly service: AiTaskManagerService) {}
  @Get('notifications') list(@Req() request: AuthenticatedRequest, @Query('status') status?: string) { return this.service.list(request.user.id, status); }
  @Post('tasks/:taskId/evaluate') evaluate(@Req() request: AuthenticatedRequest, @Param('taskId', ParseUUIDPipe) taskId: string) { return this.service.evaluateForUser(request.user.id, taskId); }
  @Patch('notifications/:id/:action') update(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Param('action') action: 'read' | 'dismiss' | 'snooze' | 'action') { return this.service.updateStatus(request.user.id, id, action); }
}
