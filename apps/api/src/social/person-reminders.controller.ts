import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
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
  checkNearby(@Req() request: AuthenticatedRequest) {
    return this.personRemindersService.checkNearby(request.user.id);
  }
}
