import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiPlannerService } from './ai-planner.service';

@Controller('ai/planner')
@UseGuards(JwtAuthGuard)
export class AiPlannerController {
  constructor(private readonly aiPlannerService: AiPlannerService) {}

  @Post('daily')
  @HttpCode(HttpStatus.OK)
  generateDailyPlan(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.aiPlannerService.generateDailyPlan(
      request.user.id,
      body && typeof body === 'object' ? body : {},
    );
  }

  @Get('preferences')
  getPreferences(@Req() request: AuthenticatedRequest) {
    return this.aiPlannerService.getPreferences(request.user.id);
  }

  @Put('preferences')
  updatePreferences(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.aiPlannerService.savePreferences(
      request.user.id,
      body && typeof body === 'object' ? body : {},
    );
  }
}
