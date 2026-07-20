import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { audioMulterOptions } from '../speech/audio-upload.options';
import { SpeechService } from '../speech/speech.service';
import { AiService } from './ai.service';
import { ParseReminderDto } from './dto/parse-reminder.dto';
import { ParseRecurrenceDto } from './dto/parse-recurrence.dto';
import { SmartLocationInferenceDto } from './dto/smart-location-inference.dto';
import { TaskPlanChatDto } from './dto/task-plan-chat.dto';
import { RecurrenceParseService } from './recurrence-parse.service';
import { RecurrenceSuggestionsService } from './recurrence-suggestions.service';
import { SmartLocationInferenceService } from './smart-location-inference.service';
import { TaskPlanChatService } from './task-plan-chat.service';

@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  private readonly logger = new Logger(AiController.name);

  constructor(
    private readonly aiService: AiService,
    private readonly speechService: SpeechService,
    private readonly taskPlanChatService: TaskPlanChatService,
    private readonly recurrenceParseService: RecurrenceParseService,
    private readonly recurrenceSuggestionsService: RecurrenceSuggestionsService,
    private readonly smartLocationInferenceService: SmartLocationInferenceService,
  ) {}

  @Post('task-plan/chat')
  @HttpCode(HttpStatus.OK)
  taskPlanChat(@Req() request: AuthenticatedRequest, @Body() dto: TaskPlanChatDto) {
    this.logger.log(`POST /ai/task-plan/chat — HTTP request received (user=${request.user.id})`);
    return this.taskPlanChatService.chat(request.user.id, dto);
  }

  @Post('parse-reminder')
  @HttpCode(HttpStatus.OK)
  parseReminder(@Body() dto: ParseReminderDto) {
    return this.aiService.parseReminder(dto.text);
  }

  @Post('smart-location')
  @HttpCode(HttpStatus.OK)
  smartLocation(@Body() dto: SmartLocationInferenceDto) {
    return this.smartLocationInferenceService.infer(dto.text);
  }

  @Post('recurrence/parse')
  @HttpCode(HttpStatus.OK)
  parseRecurrence(@Body() dto: ParseRecurrenceDto) {
    return this.recurrenceParseService.parse(dto);
  }

  @Get('recurrence/suggestions')
  recurrenceSuggestions(@Req() request: AuthenticatedRequest) {
    return this.recurrenceSuggestionsService.list(request.user.id);
  }

  @Post('recurrence/suggestions/:id/dismiss')
  @HttpCode(HttpStatus.OK)
  dismissRecurrenceSuggestion(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.recurrenceSuggestionsService.dismiss(request.user.id, id);
  }

  @Post('parse-person-reminder')
  @HttpCode(HttpStatus.OK)
  parsePersonReminder(
    @Req() request: AuthenticatedRequest,
    @Body() dto: ParseReminderDto,
  ) {
    return this.aiService.parsePersonReminder(request.user.id, dto.text);
  }

  @Post('voice-reminder-draft')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('audio', audioMulterOptions))
  async voiceReminderDraft(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('An audio file is required.');
    }

    const transcript = await this.speechService.transcribe(file);
    const draft = await this.aiService.parseReminder(transcript);
    return { transcript, draft };
  }
}
