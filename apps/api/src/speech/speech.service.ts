import {
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AssemblyAI } from 'assemblyai';

@Injectable()
export class SpeechService {
  private readonly logger = new Logger(SpeechService.name);
  private readonly client: AssemblyAI;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('ASSEMBLYAI_API_KEY');
    if (!apiKey) {
      throw new Error('ASSEMBLYAI_API_KEY is not configured');
    }
    this.client = new AssemblyAI({ apiKey });
  }

  async transcribe(file: Express.Multer.File): Promise<string> {
    try {
      const transcript = await this.client.transcripts.transcribe({
        audio: file.buffer,
        language_detection: true,
      });

      if (transcript.status === 'error') {
        this.logger.error(`AssemblyAI transcription failed: ${transcript.error}`);
        throw new InternalServerErrorException('Failed to transcribe audio.');
      }

      const text = transcript.text?.trim();
      if (!text) {
        throw new UnprocessableEntityException('No speech could be detected in the audio.');
      }

      return text;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(
        `AssemblyAI request failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      throw new InternalServerErrorException('Failed to transcribe audio.');
    }
  }
}
