import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { DatabaseModule } from '../db/database.module';
import { AiModule } from '../ai/ai.module';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotesController } from './notes.controller';
import { NotesService } from './notes.service';
import { DailyMotivationService } from './daily-motivation.service';

@Module({
  imports: [
    DatabaseModule,
    AiModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret:
          configService.get<string>('JWT_SECRET') ??
          configService.get<string>('DATABASE_URL') ??
          'beeplan-dev-jwt-secret-change-me',
      }),
    }),
  ],
  controllers: [NotesController],
  providers: [NotesService, DailyMotivationService, JwtAuthGuard],
})
export class NotesModule {}
