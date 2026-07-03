import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { audioMulterOptions } from './audio-upload.options';
import { SpeechService } from './speech.service';

@Controller('speech')
export class SpeechController {
  constructor(private readonly speechService: SpeechService) {}

  @Post('transcribe')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('audio', audioMulterOptions))
  async transcribe(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('An audio file is required.');
    }

    const text = await this.speechService.transcribe(file);
    return { text };
  }
}
