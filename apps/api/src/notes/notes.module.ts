import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { DatabaseModule } from '../db/database.module';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotesController } from './notes.controller';
import { NotesService } from './notes.service';

@Module({
  imports: [
    DatabaseModule,
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
  providers: [NotesService, JwtAuthGuard],
})
export class NotesModule {}
