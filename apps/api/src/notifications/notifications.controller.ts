import {
  Controller,
  Body,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { NotificationsService } from './notifications.service';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';
import { RegisterPushDeviceDto } from './dto/register-push-device.dto';
import { UpdatePushDeviceDto } from './dto/update-push-device.dto';
import { PushNotificationsService } from './push-notifications.service';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService, private readonly pushNotifications: PushNotificationsService) {}

  @Get('push-devices')
  listPushDevices(@Req() request: AuthenticatedRequest) { return this.pushNotifications.list(request.user.id); }

  @Post('push-devices/register')
  registerPushDevice(@Req() request: AuthenticatedRequest, @Body() dto: RegisterPushDeviceDto) { return this.pushNotifications.register(request.user.id, dto); }

  @Patch('push-devices/:installationId')
  updatePushDevice(@Req() request: AuthenticatedRequest, @Param('installationId') installationId: string, @Body() dto: UpdatePushDeviceDto) { return this.pushNotifications.update(request.user.id, installationId, dto.enabled); }

  @HttpCode(HttpStatus.OK)
  @Post('push-devices/:installationId/disable')
  disablePushDevice(@Req() request: AuthenticatedRequest, @Param('installationId') installationId: string) { return this.pushNotifications.remove(request.user.id, installationId); }

  @Delete('push-devices/:installationId')
  deletePushDevice(@Req() request: AuthenticatedRequest, @Param('installationId') installationId: string) { return this.pushNotifications.remove(request.user.id, installationId); }

  @Get('preferences')
  getPreferences(@Req() request: AuthenticatedRequest) {
    return this.notificationsService.getOrCreatePreferences(request.user.id);
  }

  @Patch('preferences')
  updatePreferences(@Req() request: AuthenticatedRequest, @Body() dto: UpdateNotificationPreferencesDto) {
    return this.notificationsService.updatePreferences(request.user.id, dto);
  }

  @Get()
  list(
    @Req() request: AuthenticatedRequest,
    @Query() query: NotificationQueryDto,
  ) {
    return this.notificationsService.list(request.user.id, query);
  }

  @Get('unread-count')
  unreadCount(@Req() request: AuthenticatedRequest) {
    return this.notificationsService.unreadCount(request.user.id);
  }

  @Patch(':id/read')
  markRead(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notificationsService.markRead(request.user.id, id);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  markAllRead(@Req() request: AuthenticatedRequest) {
    return this.notificationsService.markAllRead(request.user.id);
  }
}
