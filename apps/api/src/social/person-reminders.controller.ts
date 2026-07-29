import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  CreatePersonReminderDto,
  UpdateLocationSnapshotDto,
} from './dto/social.dto';
import { PersonRemindersService } from './person-reminders.service';

@Controller('person-reminders')
@UseGuards(JwtAuthGuard)
export class PersonRemindersController {
  constructor(
    private readonly personRemindersService: PersonRemindersService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreatePersonReminderDto,
  ) {
    return this.personRemindersService.create(request.user.id, dto);
  }

  @Post('location-snapshot')
  @HttpCode(HttpStatus.OK)
  updateSnapshot(
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpdateLocationSnapshotDto,
  ) {
    return this.personRemindersService.updateSnapshot(request.user.id, dto);
  }

  @Get('nearby')
  @Header(
    'Cache-Control',
    'no-store, no-cache, must-revalidate, proxy-revalidate',
  )
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  checkNearby(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    // Express turns a matching If-None-Match response into 304 after the
    // controller returns. This endpoint performs stateful geofence evaluation,
    // so a conditional response is never valid even when its JSON body happens
    // to match the previous poll.
    delete request.headers['if-none-match'];
    delete request.headers['if-modified-since'];
    response.removeHeader('ETag');
    return this.personRemindersService.checkNearby(request.user.id);
  }
}
