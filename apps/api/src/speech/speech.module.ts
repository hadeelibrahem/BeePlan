import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DatabaseModule } from '../db/database.module';
import { SpeechController } from './speech.controller';
import { SpeechService } from './speech.service';

@Module({
  // JwtModule is registered `global: true` in AuthModule, so JwtService is available
  // here without re-registering it — see auth.module.ts.
  imports: [DatabaseModule],
  controllers: [SpeechController],
  providers: [SpeechService, JwtAuthGuard],
  exports: [SpeechService],
})
export class SpeechModule {}
