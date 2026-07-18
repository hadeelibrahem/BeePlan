import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../../auth/jwt-auth.guard';
import { TaskAccessService } from '../../collaboration/task-access.service';
import { AiCollaborationViewsService } from './ai-collaboration-views.service';
import { AiRecommendationsService } from './ai-recommendations.service';
import { WorkloadCapacityService } from './workload-capacity.service';

/**
 * The persistent AI Collaboration surface (Capacity/Today/Progress/Timeline/
 * Suggestions tabs). Sits alongside AiCollaborationPlannerController's
 * generate/apply routes under the same `tasks/:taskId/ai/collaboration*`
 * namespace but under its own `ai/collaboration` segment so the two never
 * clash. Every route is read-only for any accepted viewer+; mutating routes
 * (added in a later stage, for suggestion approve/dismiss) require editor+.
 */
@UseGuards(JwtAuthGuard)
@Controller('tasks/:taskId/ai/collaboration')
export class AiCollaborationController {
  constructor(
    private readonly access: TaskAccessService,
    private readonly capacity: WorkloadCapacityService,
    private readonly views: AiCollaborationViewsService,
    private readonly recommendations: AiRecommendationsService,
  ) {}

  @Get('capacity')
  async getCapacity(
    @Req() request: AuthenticatedRequest,
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ) {
    await this.access.require(request.user.id, taskId, 'viewer');
    return { members: await this.capacity.getCapacityBands(taskId) };
  }

  @Get('today')
  async getToday(
    @Req() request: AuthenticatedRequest,
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ) {
    await this.access.require(request.user.id, taskId, 'viewer');
    return this.views.getToday(taskId);
  }

  @Get('progress')
  async getProgress(
    @Req() request: AuthenticatedRequest,
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ) {
    await this.access.require(request.user.id, taskId, 'viewer');
    return this.views.getProgress(taskId);
  }

  @Get('timeline')
  async getTimeline(
    @Req() request: AuthenticatedRequest,
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ) {
    await this.access.require(request.user.id, taskId, 'viewer');
    return this.views.getTimeline(taskId);
  }

  @Get('suggestions')
  async getSuggestions(
    @Req() request: AuthenticatedRequest,
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ) {
    await this.access.require(request.user.id, taskId, 'viewer');
    return { items: await this.recommendations.list(taskId) };
  }

  @Post('suggestions/:recommendationId/approve')
  @HttpCode(HttpStatus.OK)
  async approveSuggestion(
    @Req() request: AuthenticatedRequest,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('recommendationId', ParseUUIDPipe) recommendationId: string,
  ) {
    await this.recommendations.approve(request.user.id, taskId, recommendationId);
    return { success: true };
  }

  @Post('suggestions/:recommendationId/dismiss')
  @HttpCode(HttpStatus.OK)
  async dismissSuggestion(
    @Req() request: AuthenticatedRequest,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('recommendationId', ParseUUIDPipe) recommendationId: string,
  ) {
    await this.recommendations.dismiss(request.user.id, taskId, recommendationId);
    return { success: true };
  }
}
