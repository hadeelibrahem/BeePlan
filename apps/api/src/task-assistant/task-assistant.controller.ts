import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from '../auth/jwt-auth.guard';
import { TaskAssistantService } from './task-assistant.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class TaskAssistantController {
  constructor(private readonly service: TaskAssistantService) {}
  @Get('settings/task-assistant') preferences(
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.getPreferences(req.user.id);
  }
  @Put('settings/task-assistant') updatePreferences(
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    return this.service.updatePreferences(req.user.id, body);
  }
  @Get('tasks/:taskId/task-assistant') task(
    @Req() req: AuthenticatedRequest,
    @Param('taskId') taskId: string,
  ) {
    return this.service.getTaskAssistant(req.user.id, taskId);
  }
  @Post('tasks/:taskId/task-assistant/refresh') refresh(
    @Req() req: AuthenticatedRequest,
    @Param('taskId') taskId: string,
  ) {
    return this.service
      .refresh(req.user.id, taskId)
      .then(() => this.service.getTaskAssistant(req.user.id, taskId));
  }
  @Put('tasks/:taskId/task-assistant/context') correct(
    @Req() req: AuthenticatedRequest,
    @Param('taskId') taskId: string,
    @Body() body: unknown,
  ) {
    const context =
      isRecord(body) && typeof body.context === 'string'
        ? body.context
        : undefined;
    return this.service.correctContext(req.user.id, taskId, context);
  }
  @Patch('tasks/:taskId/task-assistant/suggestions/:suggestionId') suggestion(
    @Req() req: AuthenticatedRequest,
    @Param('taskId') taskId: string,
    @Param('suggestionId') suggestionId: string,
    @Body() body: unknown,
  ) {
    return this.service.updateSuggestion(
      req.user.id,
      taskId,
      suggestionId,
      body,
    );
  }
  @Patch('tasks/:taskId/task-assistant/notifications/:notificationId')
  notification(
    @Req() req: AuthenticatedRequest,
    @Param('taskId') taskId: string,
    @Param('notificationId') notificationId: string,
    @Body() body: unknown,
  ) {
    return this.service.updateNotification(
      req.user.id,
      taskId,
      notificationId,
      body,
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
