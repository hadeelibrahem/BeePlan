import { Controller, Get, Param, ParseUUIDPipe, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../../../auth/jwt-auth.guard';
import { ProjectPlanService } from './project-plan.service';

/**
 * The normalized project-plan model powering the AI Collaboration **Plan** tab
 * (Timeline + Dependency Graph). Read-only for any accepted viewer+; the whole
 * model — nodes, edges, forecast, and validation warnings — is derived on the
 * server so the clients only render.
 */
@UseGuards(JwtAuthGuard)
@Controller('tasks/:taskId/project-plan')
export class ProjectPlanController {
  constructor(private readonly projectPlan: ProjectPlanService) {}

  @Get()
  async getProjectPlan(
    @Req() request: AuthenticatedRequest,
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ) {
    // Access enforcement (viewer+) lives inside the service via TaskAccessService.
    return this.projectPlan.getProjectPlan(request.user.id, taskId);
  }
}
