import {
  Body,
  Controller,
  Delete,
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
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateReminderDto } from './dto/create-reminder.dto';
import { UpdateReminderDto } from './dto/update-reminder.dto';
import { RemindersService } from './reminders.service';

@UseGuards(JwtAuthGuard)
@Controller('reminders')
export class RemindersController {
  constructor(private readonly remindersService: RemindersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreateReminderDto) {
    return this.remindersService.create(request.user.id, dto);
  }

  @Get()
  findAll(@Req() request: AuthenticatedRequest) {
    return this.remindersService.findAll(request.user.id);
  }

  @Get(':id')
  findOne(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.remindersService.findOne(request.user.id, id);
  }

  @Patch(':id')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReminderDto,
  ) {
    return this.remindersService.update(request.user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    await this.remindersService.remove(request.user.id, id);
  }
}
