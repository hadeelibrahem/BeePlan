import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
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
import { TaskPlanChatDto } from './dto/task-plan-chat.dto';
import { TaskPlanChatService } from './task-plan-chat.service';

@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  private readonly logger = new Logger(AiController.name);

  constructor(
    private readonly aiService: AiService,
    private readonly speechService: SpeechService,
    private readonly taskPlanChatService: TaskPlanChatService,
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
