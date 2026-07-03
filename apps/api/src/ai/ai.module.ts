import { Module } from '@nestjs/common';
import { SpeechModule } from '../speech/speech.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

@Module({
  imports: [SpeechModule],
  controllers: [AiController],
  providers: [AiService],
})
export class AiModule {}
