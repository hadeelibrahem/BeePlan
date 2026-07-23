import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard';
import {
  CancelFocusSessionDto,
  FinishFocusSessionDto,
  StartFocusSessionDto,
} from './dto/focus.dto';
import { FocusService } from './focus.service';

@UseGuards(JwtAuthGuard)
@Controller('focus')
export class FocusController {
  constructor(private readonly focusService: FocusService) {}

  @Post('sessions/start')
  @HttpCode(HttpStatus.CREATED)
  start(
    @Req() request: AuthenticatedRequest,
    @Body() dto: StartFocusSessionDto,
  ) {
    return this.focusService.start(request.user.id, dto);
  }

  @Patch('sessions/:id/finish')
  finish(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FinishFocusSessionDto,
  ) {
    return this.focusService.finish(request.user.id, id, dto);
  }

  @Patch('sessions/:id/cancel')
  cancel(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelFocusSessionDto,
  ) {
    return this.focusService.cancel(request.user.id, id, dto);
  }

  @Get('sessions/today')
  today(@Req() request: AuthenticatedRequest) {
    return this.focusService.today(request.user.id);
  }

  @Get('stats')
  stats(@Req() request: AuthenticatedRequest) {
    return this.focusService.stats(request.user.id);
  }

  @Get('recommendation')
  recommendation(@Req() request: AuthenticatedRequest) {
    return this.focusService.recommendation(request.user.id);
  }

  @Get('active')
  active(@Req() request: AuthenticatedRequest) {
    return this.focusService.active(request.user.id);
  }

  @Get('queue')
  queue(@Req() request: AuthenticatedRequest) {
    return this.focusService.queue(request.user.id);
  }
}
