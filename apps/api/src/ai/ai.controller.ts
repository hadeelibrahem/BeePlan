import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { audioMulterOptions } from '../speech/audio-upload.options';
import { SpeechService } from '../speech/speech.service';
import { AiService } from './ai.service';
import { ParseReminderDto } from './dto/parse-reminder.dto';

@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly speechService: SpeechService,
  ) {}

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
