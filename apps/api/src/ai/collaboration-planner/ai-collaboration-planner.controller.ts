import { Body, Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../../auth/jwt-auth.guard';
import { AiCollaborationPlannerService } from './ai-collaboration-planner.service';
import { ApplyCollaborationPlanDto, GenerateCollaborationPlanDto } from './dto/collaboration-plan.dto';

/**
 * Shares the `tasks` base path with TasksController/CollaborationController;
 * both routes here are owner-only and nested under a distinct `ai/` segment
 * so there is no clash with `tasks/:id` or the collaboration routes.
 */
@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class AiCollaborationPlannerController {
  constructor(private readonly planner: AiCollaborationPlannerService) {}

  @Post(':taskId/ai/collaboration-plan')
  @HttpCode(HttpStatus.OK)
  generate(
    @Req() request: AuthenticatedRequest,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: GenerateCollaborationPlanDto,
  ) {
    return this.planner.generate(request.user.id, taskId, dto);
  }

  @Post(':taskId/ai/collaboration-plan/apply')
  @HttpCode(HttpStatus.OK)
  apply(
    @Req() request: AuthenticatedRequest,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: ApplyCollaborationPlanDto,
  ) {
    return this.planner.apply(request.user.id, taskId, dto);
  }
}
