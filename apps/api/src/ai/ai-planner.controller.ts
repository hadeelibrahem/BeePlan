import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiPlannerService } from './ai-planner.service';
import { randomUUID } from 'crypto';

@Controller('ai/planner')
@UseGuards(JwtAuthGuard)
export class AiPlannerController {
  constructor(private readonly aiPlannerService: AiPlannerService) {}

  @Post('daily')
  @HttpCode(HttpStatus.OK)
  generateDailyPlan(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    const requestId = typeof request.headers['x-planner-request-id'] === 'string'
      ? request.headers['x-planner-request-id']
      : randomUUID();
    // Every POST generation is a fresh draft. Persisted task schedule fields
    // belong to the last accepted plan and must not become hidden exact locks;
    // explicit lockedItems are still carried through and preserved.
    const payload = body && typeof body === 'object'
      ? { ...(body as Record<string, unknown>), requestId, regenerate: true }
      : { requestId, regenerate: true };
    return this.aiPlannerService.generateDailyPlan(
      request.user.id,
      payload,
    );
  }

  @Get('daily/candidates')
  getDailyCandidates(
    @Req() request: AuthenticatedRequest,
    @Query('date') date?: string,
    @Query('timezone') timezone?: string,
  ) {
    return this.aiPlannerService.getDailyCandidates(request.user.id, { date, timezone });
  }

  @Put('daily/selection')
  @HttpCode(HttpStatus.OK)
  saveDailySelection(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.aiPlannerService.saveDailySelection(request.user.id, body);
  }

  @Post('daily/accept')
  @HttpCode(HttpStatus.OK)
  acceptDailyPlan(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.aiPlannerService.acceptPlan(request.user.id, body);
  }

  @Get('daily/accept')
  getDailyPlanAcceptance(
    @Req() request: AuthenticatedRequest,
    @Query('date') date?: string,
  ) {
    return this.aiPlannerService.getAcceptance(request.user.id, date ?? '');
  }

  @Post('conflicts/resolve')
  @HttpCode(HttpStatus.OK)
  resolveConflict(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.aiPlannerService.resolveConflict(request.user.id, body);
  }

  @Get('preferences')
  getPreferences(@Req() request: AuthenticatedRequest) {
    return this.aiPlannerService.getPreferences(request.user.id);
  }

  @Put('preferences')
  updatePreferences(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    return this.aiPlannerService.savePreferences(
      request.user.id,
      body && typeof body === 'object' ? body : {},
    );
  }
}
