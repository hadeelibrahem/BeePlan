import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { RegisterPushDeviceDto } from './dto/register-push-device.dto';
import { UpdatePushDeviceDto } from './dto/update-push-device.dto';
import { PushNotificationsService } from './push-notifications.service';

@Controller('push-devices')
@UseGuards(JwtAuthGuard)
export class PushDevicesController {
  constructor(private readonly pushNotifications: PushNotificationsService) {}
  @Get() list(@Req() request: AuthenticatedRequest) { return this.pushNotifications.list(request.user.id); }
  @Post('register') register(@Req() request: AuthenticatedRequest, @Body() dto: RegisterPushDeviceDto) { return this.pushNotifications.register(request.user.id, dto); }
  @Patch(':installationId') update(@Req() request: AuthenticatedRequest, @Param('installationId') installationId: string, @Body() dto: UpdatePushDeviceDto) { return this.pushNotifications.update(request.user.id, installationId, dto.enabled); }
  @Delete(':installationId') remove(@Req() request: AuthenticatedRequest, @Param('installationId') installationId: string) { return this.pushNotifications.remove(request.user.id, installationId); }
}
