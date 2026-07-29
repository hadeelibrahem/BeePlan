import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { WeatherTravelService } from './weather-travel.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class WeatherTravelController {
  constructor(private readonly service: WeatherTravelService) {}
  @Get('weather/current') current(
    @Req() req: AuthenticatedRequest,
    @Query() query: Record<string, unknown>,
  ) {
    return this.service.currentWeather(req.user.id, query);
  }
  @Get('weather/forecast') forecast(
    @Req() req: AuthenticatedRequest,
    @Query() query: Record<string, unknown>,
  ) {
    return this.service.forecast(req.user.id, query);
  }
  @Get('settings/weather-travel') preferences(
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.getPreferences(req.user.id);
  }
  @Put('settings/weather-travel') updatePreferences(
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    return this.service.updatePreferences(req.user.id, body);
  }
  @Get('tasks/:taskId/travel-weather-preview') previewTask(
    @Req() req: AuthenticatedRequest,
    @Param('taskId') taskId: string,
  ) {
    return this.service.previewTask(req.user.id, taskId);
  }
  @Get('tasks/:taskId/subtasks/:subtaskId/travel-weather-preview')
  previewSubtask(
    @Req() req: AuthenticatedRequest,
    @Param('taskId') taskId: string,
    @Param('subtaskId') subtaskId: string,
  ) {
    return this.service.previewTask(req.user.id, taskId, subtaskId);
  }
  @Post('tasks/:taskId/travel-weather-notification/schedule') scheduleTask(
    @Req() req: AuthenticatedRequest,
    @Param('taskId') taskId: string,
  ) {
    return this.service.schedule(req.user.id, taskId);
  }
  @Post(
    'tasks/:taskId/subtasks/:subtaskId/travel-weather-notification/schedule',
  )
  scheduleSubtask(
    @Req() req: AuthenticatedRequest,
    @Param('taskId') taskId: string,
    @Param('subtaskId') subtaskId: string,
  ) {
    return this.service.schedule(req.user.id, taskId, subtaskId);
  }
  @Delete('tasks/:taskId/travel-weather-notification') cancelTask(
    @Req() req: AuthenticatedRequest,
    @Param('taskId') taskId: string,
  ) {
    return this.service.cancel(req.user.id, taskId);
  }
  @Delete('tasks/:taskId/subtasks/:subtaskId/travel-weather-notification')
  cancelSubtask(
    @Req() req: AuthenticatedRequest,
    @Param('taskId') taskId: string,
    @Param('subtaskId') subtaskId: string,
  ) {
    return this.service.cancel(req.user.id, taskId, subtaskId);
  }
  @Get('weather-travel/notifications/upcoming') upcoming(
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.upcoming(req.user.id);
  }
  @Post('weather-travel/notifications/:id/acknowledge') acknowledge(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.service.acknowledge(req.user.id, id);
  }
}
