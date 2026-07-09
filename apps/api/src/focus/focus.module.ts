import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DatabaseModule } from '../db/database.module';
import { FocusController } from './focus.controller';
import { FocusService } from './focus.service';

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
  controllers: [FocusController],
  providers: [FocusService, JwtAuthGuard],
})
export class FocusModule {}
